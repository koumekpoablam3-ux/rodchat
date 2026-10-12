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
import { acquireMedia, fetchIceServers, mediaErrorMessage } from "@/lib/call-media";
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
  data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
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
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Libère tout : sonnerie, connexion WebRTC, micro et caméra */
  const teardown = useCallback(() => {
    stopRingtone();
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    disconnectTimer.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
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
      if (current?.callId) getSocket().emit("call:end", { callId: current.callId });
      finish(message);
    },
    [finish],
  );

  /** Crée la connexion WebRTC avec l'autre appareil et y branche le micro (et la caméra) */
  const buildPeer = useCallback(
    async (callId: string, stream: MediaStream) => {
      const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          getSocket().emit("call:signal", { callId, data: { candidate: event.candidate.toJSON() } });
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
          stopRingtone();
          setCall((prev) =>
            prev ? { ...prev, phase: "active", startedAt: prev.startedAt ?? Date.now(), unstable: false } : prev,
          );
        } else if (state === "disconnected") {
          setCall((prev) => (prev ? { ...prev, unstable: true } : prev));
          if (!disconnectTimer.current) {
            disconnectTimer.current = setTimeout(
              () => hangUp("La connexion a été interrompue. Réessaie dans un instant."),
              10_000,
            );
          }
        } else if (state === "failed") {
          hangUp("La connexion a échoué. Réessaie, ou change de réseau.");
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [setCall, hangUp],
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
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pendingCandidates.current.push(data.candidate);
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
      if (callRef.current) finish("Connexion perdue : l'appel est terminé.");
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:accepted", onAccepted);
    socket.on("call:signal", onSignal);
    socket.on("call:ended", onEnded);
    socket.on("call:handled", onHandled);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:accepted", onAccepted);
      socket.off("call:signal", onSignal);
      socket.off("call:ended", onEnded);
      socket.off("call:handled", onHandled);
      socket.off("disconnect", onDisconnect);
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
