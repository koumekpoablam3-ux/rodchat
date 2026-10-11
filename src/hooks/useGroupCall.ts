"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { acquireMedia, fetchIceServers, mediaErrorMessage } from "@/lib/call-media";
import { startRingtone, stopRingtone } from "@/lib/ringtone";
import { getSocket } from "@/lib/socket";
import type { CallKind, CallPerson, ConversationSummary, OngoingGroupCall } from "@/types/chat";

export type GroupPeer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  stream: MediaStream | null;
  connected: boolean;
};

export type ActiveGroupCall = {
  /** Null une fraction de seconde, le temps que le serveur crée l'appel */
  callId: string | null;
  conversationId: string;
  kind: CallKind;
  groupName: string;
  /** « ringing » : appel reçu, pas encore décroché. « active » : je suis dans l'appel. */
  phase: "ringing" | "active";
  from: { id: string; name: string; avatarUrl: string | null } | null;
  micOn: boolean;
  camOn: boolean;
  localStream: MediaStream | null;
  peers: GroupPeer[];
  startedAt: number | null;
};

type IncomingPayload = {
  callId: string;
  conversationId: string;
  kind: CallKind;
  groupName: string;
  from: CallPerson;
};

type SignalPayload = {
  callId: string;
  from: string;
  data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
};

type Connection = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] };

type Options = {
  conversationsRef: MutableRefObject<ConversationSummary[]>;
  /** Vrai si un appel 1-à-1 est en cours ou sonne */
  isDirectBusy: () => boolean;
  notify: (message: string) => void;
};

const toPeer = (person: CallPerson): GroupPeer => ({
  id: person.id,
  name: person.displayName,
  avatarUrl: person.avatarUrl,
  stream: null,
  connected: false,
});

const JOIN_ERRORS: Record<string, string> = {
  gone: "Cet appel est terminé.",
  full: "L'appel est complet (6 personnes au maximum).",
  busy: "Tu es déjà en appel.",
  already: "Tu es déjà dans cet appel sur un autre appareil.",
  forbidden: "Tu ne fais plus partie de ce groupe.",
};

/**
 * Appels de groupe : chaque participant est relié directement à chacun des autres.
 * La personne qui arrive envoie une offre à tous ceux déjà présents ; le serveur relaie les messages.
 */
export function useGroupCall({ conversationsRef, isDirectBusy, notify }: Options) {
  const [group, setGroupState] = useState<ActiveGroupCall | null>(null);
  const [ongoing, setOngoing] = useState<Record<string, OngoingGroupCall>>({});

  const groupRef = useRef<ActiveGroupCall | null>(null);
  const ongoingRef = useRef(ongoing);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connections = useRef(new Map<string, Connection>());
  const iceServers = useRef<RTCIceServer[]>([]);
  const directBusyRef = useRef(isDirectBusy);
  const notifyRef = useRef(notify);

  useEffect(() => {
    directBusyRef.current = isDirectBusy;
    notifyRef.current = notify;
  }, [isDirectBusy, notify]);
  useEffect(() => {
    ongoingRef.current = ongoing;
  }, [ongoing]);

  const setGroup = useCallback(
    (next: ActiveGroupCall | null | ((prev: ActiveGroupCall | null) => ActiveGroupCall | null)) => {
      const value = typeof next === "function" ? next(groupRef.current) : next;
      groupRef.current = value;
      setGroupState(value);
    },
    [],
  );

  const updatePeer = useCallback(
    (peerId: string, patch: Partial<GroupPeer>) =>
      setGroup((prev) =>
        prev ? { ...prev, peers: prev.peers.map((p) => (p.id === peerId ? { ...p, ...patch } : p)) } : prev,
      ),
    [setGroup],
  );

  /** Libère tout : sonnerie, connexions, micro et caméra */
  const teardown = useCallback(() => {
    stopRingtone();
    connections.current.forEach(({ pc }) => pc.close());
    connections.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setGroup(null);
  }, [setGroup]);

  const removePeer = useCallback(
    (peerId: string) => {
      connections.current.get(peerId)?.pc.close();
      connections.current.delete(peerId);
      setGroup((prev) => (prev ? { ...prev, peers: prev.peers.filter((p) => p.id !== peerId) } : prev));
    },
    [setGroup],
  );

  /** Crée la connexion avec une personne. L'initiateur (le dernier arrivé) envoie l'offre. */
  const createConnection = useCallback(
    async (peerId: string, callId: string, initiator: boolean) => {
      const stream = localStreamRef.current;
      if (!stream) return;

      const pc = new RTCPeerConnection({ iceServers: iceServers.current });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const connection: Connection = { pc, pending: [] };
      connections.current.set(peerId, connection);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          getSocket().emit("groupcall:signal", {
            callId,
            to: peerId,
            data: { candidate: event.candidate.toJSON() },
          });
        }
      };
      pc.ontrack = (event) => {
        const [remote] = event.streams;
        if (remote) updatePeer(peerId, { stream: remote });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          stopRingtone();
          updatePeer(peerId, { connected: true });
          setGroup((prev) => (prev ? { ...prev, startedAt: prev.startedAt ?? Date.now() } : prev));
        } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          updatePeer(peerId, { connected: false });
        }
      };

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        getSocket().emit("groupcall:signal", {
          callId,
          to: peerId,
          data: { description: { type: offer.type, sdp: offer.sdp } },
        });
      }
    },
    [setGroup, updatePeer],
  );

  /** Entre dans un appel existant : micro, puis demande au serveur, puis offre à chaque personne présente */
  const joinCall = useCallback(
    async (callId: string, kind: CallKind, conversationId: string, groupName: string) => {
      stopRingtone();
      let stream: MediaStream;
      try {
        stream = await acquireMedia(kind, { group: true });
      } catch (error) {
        teardown();
        notifyRef.current(mediaErrorMessage(error, kind));
        return;
      }
      // Appel raccroché ou refusé pendant l'autorisation du micro
      if (groupRef.current && groupRef.current.callId !== callId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;
      iceServers.current = await fetchIceServers();

      getSocket().emit(
        "groupcall:join",
        { callId },
        async (ack?: { ok: boolean; error?: string; peers?: CallPerson[] }) => {
          if (!ack?.ok) {
            teardown();
            notifyRef.current(JOIN_ERRORS[ack?.error ?? ""] ?? "Impossible de rejoindre l'appel. Réessaie.");
            return;
          }
          const present = ack.peers ?? [];
          setGroup({
            callId,
            conversationId,
            kind,
            groupName,
            phase: "active",
            from: null,
            micOn: true,
            camOn: kind === "VIDEO",
            localStream: stream,
            peers: present.map(toPeer),
            startedAt: null,
          });
          try {
            for (const person of present) await createConnection(person.id, callId, true);
          } catch {
            teardown();
            getSocket().emit("groupcall:leave", { callId });
            notifyRef.current("Impossible d'établir l'appel. Réessaie.");
          }
        },
      );
    },
    [createConnection, setGroup, teardown],
  );

  const startGroupCall = useCallback(
    async (conversationId: string, kind: CallKind) => {
      if (groupRef.current || directBusyRef.current()) return;

      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation?.isGroup) return;

      const socket = getSocket();
      if (!socket.connected) {
        notifyRef.current("Tu es hors ligne. Reconnecte-toi pour appeler.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await acquireMedia(kind, { group: true });
      } catch (error) {
        notifyRef.current(mediaErrorMessage(error, kind));
        return;
      }
      if (groupRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;
      iceServers.current = await fetchIceServers();
      setGroup({
        callId: null,
        conversationId,
        kind,
        groupName: conversation.name,
        phase: "active",
        from: null,
        micOn: true,
        camOn: kind === "VIDEO",
        localStream: stream,
        peers: [],
        startedAt: null,
      });
      startRingtone("outgoing");

      socket.emit(
        "groupcall:start",
        { conversationId, kind },
        (ack?: { ok: boolean; callId?: string; error?: string }) => {
          if (!ack?.ok || !ack.callId) {
            teardown();
            notifyRef.current(
              ack?.error === "ongoing"
                ? "Un appel est déjà en cours dans ce groupe. Rejoins-le depuis la discussion."
                : ack?.error === "busy"
                  ? "Tu es déjà en appel."
                  : "Impossible de lancer l'appel. Réessaie.",
            );
            return;
          }
          if (!groupRef.current) {
            // Raccroché avant la réponse du serveur
            socket.emit("groupcall:leave", { callId: ack.callId });
            return;
          }
          setGroup((prev) => (prev ? { ...prev, callId: ack.callId as string } : prev));
        },
      );
    },
    [conversationsRef, setGroup, teardown],
  );

  /** Rejoindre un appel de groupe en cours depuis le bandeau de la discussion */
  const joinGroupCall = useCallback(
    async (conversationId: string) => {
      if (groupRef.current || directBusyRef.current()) return;
      const call = ongoingRef.current[conversationId];
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!call || !conversation) return;
      await joinCall(call.callId, call.kind, conversationId, conversation.name);
    },
    [conversationsRef, joinCall],
  );

  const acceptGroupCall = useCallback(async () => {
    const current = groupRef.current;
    if (!current || current.phase !== "ringing" || !current.callId) return;
    await joinCall(current.callId, current.kind, current.conversationId, current.groupName);
  }, [joinCall]);

  /** Refuser : l'appel continue pour les autres, et reste accessible par le bandeau */
  const declineGroupCall = useCallback(() => teardown(), [teardown]);

  const leaveGroupCall = useCallback(() => {
    const current = groupRef.current;
    if (current?.callId) getSocket().emit("groupcall:leave", { callId: current.callId });
    teardown();
  }, [teardown]);

  const toggleMic = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
    setGroup((prev) => (prev ? { ...prev, micOn: !prev.micOn } : prev));
  }, [setGroup]);

  const toggleCam = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
    setGroup((prev) => (prev ? { ...prev, camOn: !prev.camOn } : prev));
  }, [setGroup]);

  // --- Événements du serveur ---
  useEffect(() => {
    const socket = getSocket();

    const onIncoming = (payload: IncomingPayload) => {
      const current = groupRef.current;
      if (current || directBusyRef.current()) return;
      setGroup({
        callId: payload.callId,
        conversationId: payload.conversationId,
        kind: payload.kind,
        groupName: payload.groupName,
        phase: "ringing",
        from: { id: payload.from.id, name: payload.from.displayName, avatarUrl: payload.from.avatarUrl },
        micOn: true,
        camOn: payload.kind === "VIDEO",
        localStream: null,
        peers: [],
        startedAt: null,
      });
      startRingtone("incoming");
    };

    // Qui est dans l'appel de cette discussion (bandeau « Rejoindre »)
    const onUpdate = (data: OngoingGroupCall) => {
      setOngoing((prev) => {
        const next = { ...prev };
        if (data.participantIds.length === 0) delete next[data.conversationId];
        else next[data.conversationId] = data;
        return next;
      });
    };

    const onEnded = (data: { callId: string; conversationId: string }) => {
      setOngoing((prev) => {
        if (!(data.conversationId in prev)) return prev;
        const next = { ...prev };
        delete next[data.conversationId];
        return next;
      });
      const current = groupRef.current;
      if (!current || current.callId !== data.callId) return;
      const nobodyCame = current.phase === "active" && current.startedAt === null && current.peers.length === 0;
      const wasRinging = current.phase === "ringing";
      teardown();
      if (nobodyCame) notifyRef.current("Personne n'a rejoint l'appel.");
      else if (!wasRinging) notifyRef.current("L'appel de groupe est terminé.");
    };

    // Un de mes autres appareils a rejoint l'appel
    const onHandled = (data: { callId: string }) => {
      const current = groupRef.current;
      if (current?.callId === data.callId && current.phase === "ringing") teardown();
    };

    const onPeerJoined = (data: { callId: string; user: CallPerson }) => {
      const current = groupRef.current;
      if (!current || current.callId !== data.callId || current.phase !== "active") return;
      stopRingtone();
      // La connexion s'établit quand son offre arrive
      setGroup((prev) =>
        prev && !prev.peers.some((p) => p.id === data.user.id)
          ? { ...prev, peers: [...prev.peers, toPeer(data.user)] }
          : prev,
      );
    };

    const onPeerLeft = (data: { callId: string; userId: string }) => {
      if (groupRef.current?.callId === data.callId) removePeer(data.userId);
    };

    const onSignal = async ({ callId, from, data }: SignalPayload) => {
      const current = groupRef.current;
      if (!current || current.callId !== callId || current.phase !== "active") return;

      try {
        let connection = connections.current.get(from);
        if (data.description) {
          if (!connection) {
            if (data.description.type !== "offer") return;
            await createConnection(from, callId, false);
            connection = connections.current.get(from);
            if (!connection) return;
          }
          const { pc } = connection;
          await pc.setRemoteDescription(data.description);
          for (const candidate of connection.pending) await pc.addIceCandidate(candidate).catch(() => {});
          connection.pending = [];
          if (data.description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("groupcall:signal", {
              callId,
              to: from,
              data: { description: { type: answer.type, sdp: answer.sdp } },
            });
          }
        } else if (data.candidate && connection) {
          if (connection.pc.remoteDescription) await connection.pc.addIceCandidate(data.candidate).catch(() => {});
          else connection.pending.push(data.candidate);
        }
      } catch {
        removePeer(from);
      }
    };

    const onDisconnect = () => {
      if (groupRef.current) {
        teardown();
        notifyRef.current("Connexion perdue : l'appel est terminé.");
      }
    };

    socket.on("groupcall:incoming", onIncoming);
    socket.on("groupcall:update", onUpdate);
    socket.on("groupcall:ended", onEnded);
    socket.on("groupcall:handled", onHandled);
    socket.on("groupcall:peer-joined", onPeerJoined);
    socket.on("groupcall:peer-left", onPeerLeft);
    socket.on("groupcall:signal", onSignal);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("groupcall:incoming", onIncoming);
      socket.off("groupcall:update", onUpdate);
      socket.off("groupcall:ended", onEnded);
      socket.off("groupcall:handled", onHandled);
      socket.off("groupcall:peer-joined", onPeerJoined);
      socket.off("groupcall:peer-left", onPeerLeft);
      socket.off("groupcall:signal", onSignal);
      socket.off("disconnect", onDisconnect);
    };
  }, [createConnection, removePeer, setGroup, teardown]);

  // Fermeture de l'onglet : tout est libéré
  useEffect(() => () => teardown(), [teardown]);

  return {
    group,
    ongoing,
    startGroupCall,
    joinGroupCall,
    acceptGroupCall,
    declineGroupCall,
    leaveGroupCall,
    toggleMic,
    toggleCam,
  };
}
