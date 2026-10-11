import { background } from "./background";
import { postMessage } from "./messages";
import { prisma } from "./prisma";
import { sendPushToUsers } from "./push";
import { getRealtime } from "./realtime";

// État des appels audio et vidéo, tenu en base (table Call + GroupCallParticipant) puisqu'une fonction
// Vercel n'a pas de mémoire d'une requête à l'autre. Le flux audio/vidéo, lui, passe directement entre
// les appareils (WebRTC) : ici on ne fait que la signalisation et le journal.

/** Au bout de ce délai sans réponse, un appel qui sonne est « manqué » */
export const RING_TIMEOUT_MS = 45_000;
/** Un participant dont le flux n'a plus donné signe de vie depuis ce délai a quitté l'appel */
const CALL_ALIVE_MS = 45_000;

const ONGOING = ["RINGING", "ACTIVE"] as const;

export type CallCaller = { id: string; displayName: string; avatarUrl: string | null };
const userBrief = { id: true, displayName: true, avatarUrl: true } as const;

const realtime = getRealtime();

// --- Occupation ---

/** Vrai si la personne est déjà dans un appel (à deux ou de groupe) */
export async function isBusy(userId: string): Promise<boolean> {
  const ringingSince = new Date(Date.now() - RING_TIMEOUT_MS);
  const [direct, group] = await Promise.all([
    prisma.call.findFirst({
      where: {
        AND: [
          { calleeId: { not: null } },
          { OR: [{ callerId: userId }, { calleeId: userId }] },
          { OR: [{ status: "ACTIVE" }, { status: "RINGING", startedAt: { gt: ringingSince } }] },
        ],
      },
      select: { id: true },
    }),
    prisma.groupCallParticipant.findFirst({
      where: { userId, call: { status: { in: [...ONGOING] } } },
      select: { callId: true },
    }),
  ]);
  return Boolean(direct || group);
}

// --- Appels à deux ---

/** Clôture un appel à deux (une seule fois), l'enregistre et ajoute une ligne dans la discussion */
export async function endDirectCall(callId: string, status: "ENDED" | "MISSED" | "DECLINED", reason: string) {
  const live = await prisma.call.findUnique({
    where: { id: callId },
    select: { conversationId: true, callerId: true, calleeId: true, answeredAt: true, status: true },
  });
  if (!live || (live.status !== "RINGING" && live.status !== "ACTIVE")) return;

  const endedAt = new Date();
  const durationSec = live.answeredAt
    ? Math.max(0, Math.round((endedAt.getTime() - live.answeredAt.getTime()) / 1000))
    : null;

  // Mise à jour conditionnelle : si deux requêtes concluent en même temps, une seule l'emporte
  const done = await prisma.call.updateMany({
    where: { id: callId, status: { in: [...ONGOING] } },
    data: { status, endedAt, durationSec },
  });
  if (done.count === 0) return;

  const rooms = [`user:${live.callerId}`, ...(live.calleeId ? [`user:${live.calleeId}`] : [])];
  await realtime.emit(rooms, "call:ended", { callId, reason });

  try {
    await postMessage({
      senderId: live.callerId,
      conversationId: live.conversationId,
      type: "CALL",
      callId,
      // Un appel manqué reste « non lu » et notifie ; les autres sont juste consignés
      silent: status !== "MISSED",
    });
  } catch (error) {
    console.error("[call:end]", error);
  }
}

// --- Appels de groupe ---

async function groupCallState(callId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: {
      conversationId: true,
      kind: true,
      participants: { select: { userId: true }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!call) return null;
  return {
    conversationId: call.conversationId,
    callId,
    kind: call.kind,
    participantIds: call.participants.map((p) => p.userId),
  };
}

export async function emitGroupCallState(callId: string) {
  const state = await groupCallState(callId);
  if (state) await realtime.emit(`conv:${state.conversationId}`, "groupcall:update", state);
}

/** Clôture un appel de groupe (une seule fois) et ajoute une ligne dans la discussion */
export async function endGroupCall(callId: string) {
  const live = await prisma.call.findUnique({
    where: { id: callId },
    select: { conversationId: true, callerId: true, answeredAt: true, status: true },
  });
  if (!live || (live.status !== "RINGING" && live.status !== "ACTIVE")) return;

  const endedAt = new Date();
  const status = live.answeredAt ? "ENDED" : "MISSED";
  const durationSec = live.answeredAt
    ? Math.max(0, Math.round((endedAt.getTime() - live.answeredAt.getTime()) / 1000))
    : null;

  const done = await prisma.call.updateMany({
    where: { id: callId, status: { in: [...ONGOING] } },
    data: { status, endedAt, durationSec },
  });
  if (done.count === 0) return;

  await prisma.groupCallParticipant.deleteMany({ where: { callId } });
  await realtime.emit(`conv:${live.conversationId}`, "groupcall:ended", {
    callId,
    conversationId: live.conversationId,
  });

  try {
    await postMessage({
      senderId: live.callerId,
      conversationId: live.conversationId,
      type: "CALL",
      callId,
      silent: status !== "MISSED",
    });
  } catch (error) {
    console.error("[groupcall:end]", error);
  }
}

/** Quelqu'un quitte l'appel de groupe (raccroche, ou son appareil ne répond plus) */
export async function leaveGroupCall(callId: string, userId: string, connId?: string) {
  const removed = await prisma.groupCallParticipant.deleteMany({
    where: { callId, userId, ...(connId ? { connId } : {}) },
  });
  if (removed.count === 0) return;

  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: { answeredAt: true, status: true },
  });
  if (!call || (call.status !== "RINGING" && call.status !== "ACTIVE")) return;

  const remaining = await prisma.groupCallParticipant.findMany({ where: { callId }, select: { connId: true } });
  await realtime.emitBatch(
    remaining.map((r) => ({ rooms: `conn:${r.connId}`, event: "groupcall:peer-left", payload: { callId, userId } })),
  );

  // Plus personne, ou le dernier reste seul alors que l'appel avait commencé : c'est fini
  if (remaining.length === 0 || (call.answeredAt && remaining.length <= 1)) await endGroupCall(callId);
  else await emitGroupCallState(callId);
}

// --- Ménage : remplace les minuteries et la détection de déconnexion de l'ancien serveur ---

/**
 * Termine les appels qui ne peuvent plus aboutir : sonnerie sans réponse depuis 45 s, ou participant dont
 * l'appareil ne donne plus signe de vie. Appelé par les flux (toutes les ~5 s) et avant tout nouvel appel.
 */
export async function sweepCalls() {
  const now = Date.now();
  const ringCut = new Date(now - RING_TIMEOUT_MS);

  const stale = await prisma.call.findMany({
    where: { status: "RINGING", startedAt: { lt: ringCut } },
    select: { id: true, calleeId: true },
  });
  for (const call of stale) {
    if (call.calleeId) await endDirectCall(call.id, "MISSED", "missed");
    else await endGroupCall(call.id);
  }

  const active = await prisma.call.findMany({
    where: { status: { in: [...ONGOING] } },
    select: {
      id: true,
      calleeId: true,
      status: true,
      callerConnId: true,
      calleeConnId: true,
      participants: { select: { userId: true, connId: true } },
    },
  });
  if (active.length === 0) return;

  const connIds = new Set<string>();
  for (const call of active) {
    if (call.status === "ACTIVE") {
      if (call.callerConnId) connIds.add(call.callerConnId);
      if (call.calleeConnId) connIds.add(call.calleeConnId);
    }
    for (const p of call.participants) connIds.add(p.connId);
  }
  const fresh = new Set(
    (
      await prisma.realtimeConnection.findMany({
        where: { id: { in: Array.from(connIds) }, beatAt: { gt: new Date(now - CALL_ALIVE_MS) } },
        select: { id: true },
      })
    ).map((c) => c.id),
  );

  for (const call of active) {
    if (call.calleeId) {
      // Appel à deux décroché : si l'un des deux appareils a disparu, l'appel s'arrête
      if (call.status === "ACTIVE") {
        const gone = [call.callerConnId, call.calleeConnId].some((id) => !id || !fresh.has(id));
        if (gone) await endDirectCall(call.id, "ENDED", "failed");
      }
    } else {
      for (const p of call.participants) {
        if (!fresh.has(p.connId)) await leaveGroupCall(call.id, p.userId, p.connId);
      }
    }
  }
}

// --- Reprise à la connexion ---

/**
 * Ce qu'un appareil qui vient de se connecter doit savoir : un appel qui sonne pour lui,
 * les appels de groupe en cours dans ses discussions (bandeau « Rejoindre »), et ceux qui sonnent encore.
 */
export async function pendingCallEvents(userId: string): Promise<{ event: string; payload: unknown }[]> {
  const events: { event: string; payload: unknown }[] = [];
  const ringCut = new Date(Date.now() - RING_TIMEOUT_MS);

  const ringing = await prisma.call.findMany({
    where: { calleeId: userId, status: "RINGING", startedAt: { gt: ringCut } },
    select: { id: true, conversationId: true, kind: true, caller: { select: userBrief } },
  });
  for (const call of ringing) {
    events.push({
      event: "call:incoming",
      payload: { callId: call.id, conversationId: call.conversationId, kind: call.kind, from: call.caller },
    });
  }

  const groups = await prisma.call.findMany({
    where: {
      calleeId: null,
      status: { in: [...ONGOING] },
      conversation: { participants: { some: { userId } } },
    },
    select: {
      id: true,
      conversationId: true,
      kind: true,
      answeredAt: true,
      startedAt: true,
      caller: { select: userBrief },
      conversation: { select: { name: true } },
      participants: { select: { userId: true }, orderBy: { joinedAt: "asc" } },
    },
  });
  for (const call of groups) {
    const participantIds = call.participants.map((p) => p.userId);
    events.push({
      event: "groupcall:update",
      payload: { conversationId: call.conversationId, callId: call.id, kind: call.kind, participantIds },
    });
    if (!call.answeredAt && call.startedAt > ringCut && !participantIds.includes(userId)) {
      events.push({
        event: "groupcall:incoming",
        payload: {
          callId: call.id,
          conversationId: call.conversationId,
          kind: call.kind,
          groupName: call.conversation.name ?? "Groupe",
          from: call.caller,
        },
      });
    }
  }
  return events;
}

// --- Notifications des appels ---

export function pushIncomingCall(
  userIds: string[],
  opts: { title: string; body: string; conversationId: string; callId: string },
) {
  if (userIds.length === 0) return;
  background(
    sendPushToUsers(userIds, {
      title: opts.title,
      body: opts.body,
      url: `/chat/${opts.conversationId}`,
      tag: `call-${opts.callId}`,
      requireInteraction: true,
    }),
  );
}
