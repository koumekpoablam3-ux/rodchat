"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@/components/chat/ChatProvider";
import { useGroupCall } from "@/hooks/useGroupCall";
import {
  CALL_BITRATE,
  acquireMedia,
  candidatesOf,
  capSenderBitrates,
  createCandidateBatcher,
  fetchIceServers,
  mediaErrorMessage,
} from "@/lib/call-media";
import { startRingtone, stopRingtone } from "@/lib/ringtone";
import { SW_ENABLED } from "@/lib/pwa";
import { getSocket } from "@/lib/socket";
import type { CallKind, OngoingGroupCall } from "@/types/chat";
import CallScreen from "./CallScreen";
import GroupCallScreen from "./GroupCallScreen";

export type CallPhase = "calling" | "ringing" | "connecting" | "active";

export type ActiveCall = {
  /** Null pendant une fraction de seconde, le temps que le serveur crée l'appel */
  callId: string | null;
  conversationId: string;
  kind: CallKind;
  direction: "outgoing" | "incoming";
  phase: CallPhase;
  peer: { id: string; name: string; avatarUrl: string | null };
  startedAt: number | null;
  micOn: boolean;
  camOn: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  unstable: boolean;
  /** Caméra utilisée : « user » (avant, affichée en miroir) ou « environment » (arrière) */
  facing?: "user" | "environment";
  /** Je partage mon écran */
  sharing?: boolean;
  /** L'autre personne partage son écran (l'image s'affiche en entier, sans être recadrée) */
  remoteSharing?: boolean;
};

type CallContextValue = {
  startCall: (conversationId: string, kind: CallKind) => Promise<void>;
  /** Vrai pendant un appel 1-à-1 ou un appel de groupe */
  inCall: boolean;
  startGroupCall: (conversationId: string, kind: CallKind) => Promise<void>;
  joinGroupCall: (conversationId: string) => Promise<void>;
  /** Appels de groupe en cours, par discussion */
  ongoingGroupCalls: Record<string, OngoingGroupCall>;
  /** Discussion de l'appel de groupe dans lequel je suis, s'il y en a un */
  activeGroupConversationId: string | null;
};

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCall doit être utilisé dans <CallProvider>.");
  return value;
}

type IncomingPayload = {
  callId: string;
  conversationId: string;
  kind: CallKind;
  from: { id: string; displayName: string; avatarUrl: string | null };
};

type SignalPayload = {
  callId: string;
  data: {
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    candidates?: RTCIceCandidateInit[];
    screen?: boolean;
  };
};

/** Notification système quand un appel arrive alors que l'onglet est en arrière-plan */
async function notifyIncoming(payload: IncomingPayload) {
  if (document.visibilityState !== "hidden") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const title = payload.from.displayName;
  const options: NotificationOptions = {
    body: payload.kind === "VIDEO" ? "Appel vidéo entrant" : "Appel audio entrant",
    icon: "/icons/icon-192.png",
    tag: `call-${payload.callId}`,
    requireInteraction: true,
  };
  try {
    if (SW_ENABLED && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, { ...options, data: { url: `/chat/${payload.conversationId}` } });
    } else {
      new Notification(title, options);
    }
  } catch {
    /* notification impossible : la sonnerie suffit */
  }
}

/** Après une coupure du flux de signalisation, un appel déjà établi continue (le son passe en direct) : on ne raccroche qu'après ce délai */
const SIGNALING_GRACE_MS = 75_000;
/** Connexion directe perdue : on laisse ce temps au navigateur (et à une relance ICE) pour la retrouver avant de raccrocher */
const MEDIA_GRACE_MS = 30_000;
const MAX_ICE_RESTARTS = 3;
/** Sans connexion directe après ce délai, on abandonne avec un message qui dit pourquoi (au lieu d'attendre l'échec du navigateur) */
const CONNECT_TIMEOUT_MS = 35_000;

const END_NOTICE: Record<string, string> = {
  declined: "Appel refusé.",
  busy: "Cette personne est déjà en appel.",
  missed: "Pas de réponse.",
  failed: "L'appel s'est interrompu.",
};

export default function CallProvider({ children }: { children: React.ReactNode }) {
  const { me, conversations, connected } = useChat();

  const [call, setCallState] = useState<ActiveCall | null>(null);
  const [notice, setNotice] = useState("");
  const inCall = call !== null;

  // Pendant un appel, le flux temps réel reste ouvert même si l'onglet passe en arrière-plan
  useEffect(() => {
    if (!inCall) return;
    const socket = getSocket();
    socket.holdOpen(true);
    return () => {
      socket.holdOpen(false);
    };
  }, [inCall]);

  // La référence reflète toujours l'appel courant : les gestionnaires d'événements n'ont jamais une valeur périmée
  const callRef = useRef<ActiveCall | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pour comprendre un échec : TURN configuré ? candidats envoyés, relais obtenus, candidats reçus de l'autre appareil */
  const diag = useRef({ turn: false, sent: 0, relay: 0, received: 0 });
  const outageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartAttempts = useRef(0);
  const batcherRef = useRef<ReturnType<typeof createCandidateBatcher> | null>(null);
  const conversationsRef = useRef(conversations);
  const groupBusyRef = useRef(false);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const setCall = useCallback(
    (next: ActiveCall | null | ((prev: ActiveCall | null) => ActiveCall | null)) => {
      const value = typeof next === "function" ? next(callRef.current) : next;
      callRef.current = value;
      setCallState(value);
    },
    [],
  );

  const showNotice = useCallback((message: string) => setNotice(message), []);

  // Les serveurs STUN/TURN sont demandés d'avance : décrocher ne doit pas attendre une requête de plus
  useEffect(() => {
    void fetchIceServers();
  }, []);

  const groupCall = useGroupCall({
    conversationsRef,
    isDirectBusy: () => callRef.current !== null,
    notify: showNotice,
  });
  useEffect(() => {
    groupBusyRef.current = groupCall.group !== null;
  }, [groupCall.group]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 9000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Libère tout : sonnerie, connexion WebRTC, micro et caméra */
  const teardown = useCallback(() => {
    stopRingtone();
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    disconnectTimer.current = null;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = null;
    diag.current = { turn: false, sent: 0, relay: 0, received: 0 };
    if (outageTimer.current) clearTimeout(outageTimer.current);
    outageTimer.current = null;
    restartAttempts.current = 0;
    batcherRef.current?.cancel();
    batcherRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    pendingCandidates.current = [];
    setCall(null);
  }, [setCall]);

  const finish = useCallback(
    (message?: string) => {
      teardown();
      if (message) showNotice(message);
    },
    [teardown, showNotice],
  );

  const hangUp = useCallback(
    (message?: string) => {
      const current = callRef.current;
      // Réessaie tant que le réseau manque (jusqu'à 15 s) : sinon l'autre personne resterait en ligne dans le vide
      if (current?.callId) getSocket().timeout(15_000).emit("call:end", { callId: current.callId }, () => {});
      finish(message);
    },
    [finish],
  );

  /** L'appelant relance la recherche d'un chemin réseau (changement de Wi-Fi/4G, trou de couverture) sans raccrocher */
  const restartIce = useCallback(async () => {
    const pc = pcRef.current;
    const current = callRef.current;
    if (!pc || !current?.callId || current.direction !== "outgoing") return;
    if (restartAttempts.current >= MAX_ICE_RESTARTS) return;
    restartAttempts.current += 1;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      getSocket().emit("call:signal", { callId: current.callId, data: { description: { type: offer.type, sdp: offer.sdp } } });
    } catch {
      /* la minuterie de raccrochage prend le relais */
    }
  }, []);

  /** Crée la connexion WebRTC avec l'autre appareil et y branche le micro (et la caméra) */
  const buildPeer = useCallback(
    async (callId: string, stream: MediaStream) => {
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      diag.current = {
        turn: iceServers.some((server) => [server.urls].flat().some((url) => url.startsWith("turn"))),
        sent: 0,
        relay: 0,
        received: 0,
      };
      const failure = (base: string) => {
        const d = diag.current;
        return `${base} (TURN ${d.turn ? "oui" : "non"} · candidats envoyés ${d.sent}, dont relais ${d.relay} · reçus ${d.received})`;
      };

      // Jamais connecté au bout de 35 s : on dit pourquoi
      if (connectTimer.current) clearTimeout(connectTimer.current);
      connectTimer.current = setTimeout(() => {
        connectTimer.current = null;
        if (pcRef.current === pc && pc.connectionState !== "connected") {
          hangUp(failure("La connexion directe n'a pas abouti."));
        }
      }, CONNECT_TIMEOUT_MS);

      batcherRef.current?.cancel();
      const batcher = createCandidateBatcher((candidates) => {
        getSocket().emit("call:signal", { callId, data: { candidates } });
      });
      batcherRef.current = batcher;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          diag.current.sent += 1;
          if (event.candidate.type === "relay") diag.current.relay += 1;
          batcher.add(event.candidate.toJSON());
        } else {
          batcher.flush(); // fin de la collecte : on envoie le reste tout de suite
        }
      };
      pc.ontrack = (event) => {
        const [remote] = event.streams;
        if (remote) setCall((prev) => (prev ? { ...prev, remoteStream: remote } : prev));
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
          disconnectTimer.current = null;
          if (restartTimer.current) clearTimeout(restartTimer.current);
          restartTimer.current = null;
          if (connectTimer.current) clearTimeout(connectTimer.current);
          connectTimer.current = null;
          restartAttempts.current = 0;
          stopRingtone();
          setCall((prev) =>
            prev ? { ...prev, phase: "active", startedAt: prev.startedAt ?? Date.now(), unstable: false } : prev,
          );
          void capSenderBitrates(pc, {
            audio: CALL_BITRATE.audio,
            video: screenStreamRef.current ? CALL_BITRATE.screen : CALL_BITRATE.video,
          });
        } else if (state === "disconnected" || state === "failed") {
          const everConnected = callRef.current?.startedAt != null;
          // Jamais connecté : inutile d'attendre, aucun chemin réseau n'a abouti (réseau qui bloque la connexion directe)
          if (state === "failed" && !everConnected) {
            hangUp(failure("La connexion a échoué. Réessaie, ou change de réseau."));
            return;
          }
          setCall((prev) => (prev ? { ...prev, unstable: true } : prev));
          // Les coupures brèves sont fréquentes sur mobile : on relance la recherche de chemin avant de renoncer
          if (!restartTimer.current) {
            restartTimer.current = setTimeout(
              () => {
                restartTimer.current = null;
                void restartIce();
              },
              state === "failed" ? 0 : 3_000,
            );
          }
          if (!disconnectTimer.current) {
            disconnectTimer.current = setTimeout(
              () => hangUp("La connexion a été interrompue. Réessaie dans un instant."),
              MEDIA_GRACE_MS,
            );
          }
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [setCall, hangUp, restartIce],
  );

  const startCall = useCallback(
    async (conversationId: string, kind: CallKind) => {
      if (callRef.current || groupBusyRef.current) return;

      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const peer = conversation?.participants.find((p) => p.id === conversation.otherUserId);
      if (!conversation || conversation.isGroup || !peer) return;

      const socket = getSocket();
      if (!socket.connected) {
        showNotice("Tu es hors ligne. Reconnecte-toi pour appeler.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await acquireMedia(kind);
      } catch (error) {
        showNotice(mediaErrorMessage(error, kind));
        return;
      }
      if (callRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;
      setCall({
        callId: null,
        conversationId,
        kind,
        direction: "outgoing",
        phase: "calling",
        peer: { id: peer.id, name: peer.displayName, avatarUrl: peer.avatarUrl },
        startedAt: null,
        micOn: true,
        camOn: kind === "VIDEO",
        localStream: stream,
        remoteStream: null,
        unstable: false,
      });
      startRingtone("outgoing");

      socket.emit(
        "call:start",
        { conversationId, kind },
        (ack?: { ok: boolean; callId?: string; error?: string }) => {
          if (!ack?.ok || !ack.callId) {
            finish(
              ack?.error === "busy"
                ? END_NOTICE.busy
                : ack?.error === "blocked"
                  ? "Tu ne peux pas appeler cette personne."
                  : "Impossible de lancer l'appel. Réessaie.",
            );
            return;
          }
          if (!callRef.current) {
            // Raccroché avant la réponse du serveur : on annule l'appel qui vient d'être créé
            socket.emit("call:end", { callId: ack.callId });
            return;
          }
          setCall((prev) => (prev ? { ...prev, callId: ack.callId as string } : prev));
        },
      );
    },
    [setCall, finish, showNotice],
  );

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.direction !== "incoming" || !current.callId) return;
    const { callId, kind } = current;

    stopRingtone();
    let stream: MediaStream;
    try {
      stream = await acquireMedia(kind);
    } catch (error) {
      getSocket().emit("call:decline", { callId });
      finish(mediaErrorMessage(error, kind));
      return;
    }
    if (callRef.current?.callId !== callId) {
      // L'appel s'est terminé pendant l'autorisation du micro
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    localStreamRef.current = stream;
    setCall((prev) =>
      prev ? { ...prev, phase: "connecting", localStream: stream, micOn: true, camOn: kind === "VIDEO" } : prev,
    );

    try {
      // La connexion doit exister avant que l'autre appareil envoie son offre
      await buildPeer(callId, stream);
      getSocket().emit("call:accept", { callId }, (ack?: { ok: boolean }) => {
        if (!ack?.ok) finish("Cet appel n'est plus disponible.");
      });
    } catch {
      getSocket().emit("call:end", { callId });
      finish("Impossible d'établir l'appel. Réessaie.");
    }
  }, [buildPeer, finish, setCall]);

  const declineCall = useCallback(() => {
    const current = callRef.current;
    if (current?.callId) getSocket().emit("call:decline", { callId: current.callId });
    finish();
  }, [finish]);

  const toggleMic = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
    setCall((prev) => (prev ? { ...prev, micOn: !prev.micOn } : prev));
  }, [setCall]);

  const toggleCam = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
    setCall((prev) => (prev ? { ...prev, camOn: !prev.camOn } : prev));
  }, [setCall]);

  // Caméra avant ↔ arrière (téléphones et tablettes), sans couper l'appel : la nouvelle image remplace l'ancienne
  // sur le même flux vidéo, aucune renégociation.
  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const oldTrack = stream?.getVideoTracks()[0];
    if (!stream || !oldTrack || screenStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    const current = (oldTrack.getSettings().facingMode as "user" | "environment" | undefined) ?? callRef.current?.facing ?? "user";
    const next = current === "environment" ? "user" : "environment";
    const open = (facing: "user" | "environment") =>
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } },
      });

    let fresh: MediaStream | null = null;
    let facing: "user" | "environment" = next;
    try {
      fresh = await open(next);
    } catch {
      // Sur certains Android, deux caméras ne s'ouvrent pas ensemble : on libère l'ancienne puis on réessaie
      oldTrack.stop();
      try {
        fresh = await open(next);
      } catch {
        try {
          fresh = await open(current); // pas d'autre caméra : on retrouve la même
          facing = current;
        } catch {
          return;
        }
      }
    }
    const track = fresh.getVideoTracks()[0];
    if (!track) return;
    track.enabled = oldTrack.enabled; // une caméra coupée le reste
    const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
    await sender?.replaceTrack(track).catch(() => {});
    stream.removeTrack(oldTrack);
    oldTrack.stop();
    stream.addTrack(track);
    const refreshed = new MediaStream(stream.getTracks()); // nouvel objet : l'aperçu se recharge
    localStreamRef.current = refreshed;
    setCall((prev) => (prev ? { ...prev, localStream: refreshed, facing } : prev));
  }, [setCall]);

  // Partage d'écran : l'image de l'écran remplace celle de la caméra sur le même flux vidéo (aucune renégociation).
  // Seulement en appel vidéo à deux, sur ordinateur (les téléphones ne savent pas partager leur écran).
  const stopShare = useCallback(async () => {
    const screen = screenStreamRef.current;
    if (!screen) return;
    screenStreamRef.current = null;
    screen.getTracks().forEach((track) => track.stop());
    const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
    const camera = localStreamRef.current?.getVideoTracks()[0] ?? null;
    await sender?.replaceTrack(camera).catch(() => {});
    if (pcRef.current) void capSenderBitrates(pcRef.current, { video: CALL_BITRATE.video });
    const callId = callRef.current?.callId;
    if (callId) getSocket().emit("call:signal", { callId, data: { screen: false } });
    setCall((prev) => (prev ? { ...prev, sharing: false } : prev));
  }, [setCall]);

  const toggleShare = useCallback(async () => {
    if (screenStreamRef.current) return stopShare();
    const pc = pcRef.current;
    const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
    if (!pc || !sender || !navigator.mediaDevices?.getDisplayMedia) return;
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.getVideoTracks()[0];
      if (!track) return screen.getTracks().forEach((t) => t.stop());
      await sender.replaceTrack(track);
      screenStreamRef.current = screen;
      void capSenderBitrates(pc, { video: CALL_BITRATE.screen }); // du texte à l'écran demande plus qu'un visage
      // La personne arrête le partage avec le bouton du navigateur
      track.addEventListener("ended", () => void stopShare());
      const callId = callRef.current?.callId;
      if (callId) getSocket().emit("call:signal", { callId, data: { screen: true } });
      setCall((prev) => (prev ? { ...prev, sharing: true } : prev));
    } catch {
      /* partage refusé ou annulé : rien ne change */
    }
  }, [setCall, stopShare]);

  // --- Événements de signalisation ---
  useEffect(() => {
    const socket = getSocket();

    const onIncoming = (payload: IncomingPayload) => {
      const current = callRef.current;
      if (current || groupBusyRef.current) {
        // Déjà en appel (ou même appel reçu deux fois après une reconnexion)
        if (current?.callId !== payload.callId) socket.emit("call:decline", { callId: payload.callId, reason: "busy" });
        return;
      }
      setCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        kind: payload.kind,
        direction: "incoming",
        phase: "ringing",
        peer: { id: payload.from.id, name: payload.from.displayName, avatarUrl: payload.from.avatarUrl },
        startedAt: null,
        micOn: true,
        camOn: payload.kind === "VIDEO",
        localStream: null,
        remoteStream: null,
        unstable: false,
      });
      startRingtone("incoming");
      void notifyIncoming(payload);
    };

    // L'autre personne a décroché : on lance l'offre WebRTC
    const onAccepted = async ({ callId }: { callId: string }) => {
      const current = callRef.current;
      const stream = localStreamRef.current;
      if (!current || current.callId !== callId || !stream) return;

      stopRingtone();
      setCall((prev) => (prev ? { ...prev, phase: "connecting" } : prev));
      try {
        const pc = await buildPeer(callId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:signal", { callId, data: { description: { type: offer.type, sdp: offer.sdp } } });
      } catch {
        hangUp("Impossible d'établir l'appel. Réessaie.");
      }
    };

    const onSignal = async ({ callId, data }: SignalPayload) => {
      const current = callRef.current;
      const pc = pcRef.current;
      if (!current || current.callId !== callId || !pc) return;

      try {
        if (data.description) {
          await pc.setRemoteDescription(data.description);
          for (const candidate of pendingCandidates.current) await pc.addIceCandidate(candidate).catch(() => {});
          pendingCandidates.current = [];
          if (data.description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("call:signal", { callId, data: { description: { type: answer.type, sdp: answer.sdp } } });
          }
        } else if (data.candidate || data.candidates) {
          for (const candidate of candidatesOf(data)) {
            diag.current.received += 1;
            if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
            else pendingCandidates.current.push(candidate);
          }
        } else if (typeof data.screen === "boolean") {
          const sharing = data.screen;
          setCall((prev) => (prev ? { ...prev, remoteSharing: sharing } : prev));
        }
      } catch {
        hangUp("La connexion a échoué. Réessaie.");
      }
    };

    const onEnded = ({ callId, reason }: { callId: string; reason: string }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId) return;
      if (current.direction === "incoming") {
        // Appelant parti avant qu'on réponde, ou appel terminé
        finish(reason === "cancelled" ? "Appel manqué." : reason === "ended" ? undefined : END_NOTICE[reason]);
      } else {
        finish(reason === "ended" ? undefined : END_NOTICE[reason]);
      }
    };

    // Un autre de mes appareils a décroché
    const onHandled = ({ callId }: { callId: string }) => {
      const current = callRef.current;
      if (current?.callId === callId && current.direction === "incoming" && current.phase === "ringing") finish();
    };

    const onDisconnect = () => {
      const current = callRef.current;
      if (!current) return;
      // Sonnerie en cours : sans signalisation, l'appel ne peut pas aboutir
      if (current.phase === "calling" || current.phase === "ringing") {
        finish("Connexion perdue : l'appel est terminé.");
        return;
      }
      // Appel établi : le son et l'image passent en direct entre les deux appareils, la coupure du flux de
      // signalisation n'y change rien. On ne raccroche que si elle dure vraiment (le serveur fait de même).
      if (!outageTimer.current) {
        outageTimer.current = setTimeout(() => {
          outageTimer.current = null;
          if (callRef.current) finish("Connexion perdue : l'appel est terminé.");
        }, SIGNALING_GRACE_MS);
      }
    };

    const onReconnect = () => {
      if (outageTimer.current) clearTimeout(outageTimer.current);
      outageTimer.current = null;
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:accepted", onAccepted);
    socket.on("call:signal", onSignal);
    socket.on("call:ended", onEnded);
    socket.on("call:handled", onHandled);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onReconnect);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:accepted", onAccepted);
      socket.off("call:signal", onSignal);
      socket.off("call:ended", onEnded);
      socket.off("call:handled", onHandled);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onReconnect);
    };
  }, [setCall, buildPeer, hangUp, finish]);

  // Fermeture de l'onglet : tout est libéré
  useEffect(() => () => teardown(), [teardown]);

  const { group, ongoing, startGroupCall, joinGroupCall } = groupCall;
  const activeGroupConversationId = group && group.phase === "active" ? group.conversationId : null;
  const value = useMemo<CallContextValue>(
    () => ({
      startCall,
      inCall: call !== null || group !== null,
      startGroupCall,
      joinGroupCall,
      ongoingGroupCalls: ongoing,
      activeGroupConversationId,
    }),
    [startCall, call, group, startGroupCall, joinGroupCall, ongoing, activeGroupConversationId],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {call ? (
        <CallScreen
          call={call}
          connected={connected}
          meName={me.displayName}
          onAccept={() => void acceptCall()}
          onDecline={declineCall}
          onHangUp={() => hangUp()}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          canFlip={
            call.kind === "VIDEO" &&
            !call.sharing &&
            typeof window !== "undefined" &&
            window.matchMedia("(pointer: coarse)").matches
          }
          onFlipCamera={() => void flipCamera()}
          canShare={
            call.kind === "VIDEO" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia)
          }
          onToggleShare={() => void toggleShare()}
        />
      ) : null}
      {group ? (
        <GroupCallScreen
          call={group}
          connected={connected}
          meName={me.displayName}
          onAccept={() => void groupCall.acceptGroupCall()}
          onDecline={groupCall.declineGroupCall}
          onLeave={groupCall.leaveGroupCall}
          onToggleMic={groupCall.toggleMic}
          onToggleCam={groupCall.toggleCam}
        />
      ) : null}
      {notice ? (
        <div
          role="status"
          className="rise fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[90] mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm font-medium text-bg shadow-xl"
        >
          {notice}
        </div>
      ) : null}
    </CallContext.Provider>
  );
}
