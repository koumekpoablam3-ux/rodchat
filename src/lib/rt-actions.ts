import { BlockedError, blockedMessage, blockState } from "./blocks";
import { MAX_GROUP_CALL_PEOPLE, MAX_MESSAGE_LENGTH } from "./limits";
import { postMessage } from "./messages";
import { canSeeStatusesOf } from "./statuses";
import { prisma } from "./prisma";
import { getRealtime } from "./realtime";
import {
  emitGroupCallState,
  endDirectCall,
  isBusy,
  leaveGroupCall,
  pushIncomingCall,
  sweepCalls,
} from "./rt-calls";

// Ce que le navigateur envoyait autrefois par socket.emit(...) arrive maintenant par POST /api/realtime/action.
// Chaque gestionnaire reçoit la personne connectée (issue du cookie, jamais du corps de la requête) et
// l'identifiant de l'onglet qui agit, et renvoie la réponse que Socket.IO appelait « ack ».

const realtime = getRealtime();
const userBrief = { id: true, displayName: true, avatarUrl: true } as const;

type Data = Record<string, unknown>;
type Ack = Record<string, unknown> | undefined;

const str = (value: unknown, max = 100) => (typeof value === "string" && value.length <= max ? value : "");
const callKind = (value: unknown) => (value === "VIDEO" ? "VIDEO" : value === "AUDIO" ? "AUDIO" : null);

/** Marque comme « reçus » les messages arrivés pendant que la personne était hors ligne */
export async function deliverPending(userId: string) {
  const pending = await prisma.messageReceipt.findMany({
    where: { userId, deliveredAt: null },
    select: { id: true, messageId: true, message: { select: { conversationId: true } } },
  });
  if (pending.length === 0) return;

  const now = new Date();
  await prisma.messageReceipt.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { deliveredAt: now },
  });
  await realtime.emitBatch(
    pending.map((p) => ({
      rooms: `conv:${p.message.conversationId}`,
      event: "message:delivered",
      payload: { messageId: p.messageId, userId, at: now.toISOString() },
    })),
  );
}

const isMember = async (userId: string, conversationId: string) =>
  Boolean(
    conversationId &&
      (await prisma.participant.findUnique({
        where: { userId_conversationId: { userId, conversationId } },
        select: { id: true },
      })),
  );

// --- Messages ---

async function sendMessage(userId: string, data: Data): Promise<Ack> {
  const conversationId = str(data.conversationId);
  const text = typeof data.content === "string" ? data.content.trim() : "";
  const clientId = str(data.clientId, 64) || undefined;
  const replyToId = str(data.replyToId, 40) || undefined;

  if (!conversationId || !text) return { ok: false, error: "invalid" };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "too_long" };
  if (!(await isMember(userId, conversationId))) return { ok: false, error: "forbidden" };

  // Réponse à un statut : on retrouve le statut (visible par moi, et de la personne de cette discussion)
  let statusQuote: string | null = null;
  const statusId = str(data.statusId, 40);
  if (statusId) {
    const status = await prisma.status.findFirst({
      where: { id: statusId, expiresAt: { gt: new Date() } },
      select: { authorId: true, type: true, text: true },
    });
    const direct = status
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, isGroup: false, participants: { some: { userId: status.authorId } } },
          select: { id: true },
        })
      : null;
    if (!status || !direct || !(await canSeeStatusesOf(userId, status.authorId))) {
      return { ok: false, error: "Ce statut n'est plus disponible." };
    }
    statusQuote = (status.text?.trim().slice(0, 120) || (status.type === "IMAGE" ? "Photo" : "Statut")).replace(/\s+/g, " ");
  }

  try {
    const message = await postMessage({
      senderId: userId,
      conversationId,
      type: "TEXT",
      content: text,
      clientId,
      replyToId,
      statusQuote,
    });
    return { ok: true, message };
  } catch (error) {
    if (error instanceof BlockedError) return { ok: false, error: error.userMessage };
    throw error;
  }
}

async function markRead(userId: string, data: Data): Promise<Ack> {
  const conversationId = str(data.conversationId);
  if (!(await isMember(userId, conversationId))) return;

  const now = new Date();
  const settings = await prisma.user.findUnique({ where: { id: userId }, select: { readReceipts: true } });
  await prisma.participant.updateMany({ where: { userId, conversationId }, data: { lastReadAt: now } });

  if (settings?.readReceipts === false) {
    // Accusés désactivés : l'expéditeur voit « remis », jamais « lu ».
    // Seuls mes propres appareils apprennent que la discussion est lue.
    await prisma.messageReceipt.updateMany({
      where: { userId, deliveredAt: null, message: { conversationId } },
      data: { deliveredAt: now },
    });
    await realtime.emit(`user:${userId}`, "message:read", { conversationId, userId, at: now.toISOString() });
    return;
  }

  await prisma.messageReceipt.updateMany({
    where: { userId, readAt: null, message: { conversationId } },
    data: { readAt: now },
  });
  await realtime.emit(`conv:${conversationId}`, "message:read", { conversationId, userId, at: now.toISOString() });
}

async function typing(userId: string, connId: string, data: Data): Promise<Ack> {
  const conversationId = str(data.conversationId);
  if (!(await isMember(userId, conversationId))) return;
  await realtime.emit(
    `conv:${conversationId}`,
    "typing",
    { conversationId, userId, isTyping: data.isTyping === true },
    connId,
  );
}

// --- Appels à deux ---

async function startCall(userId: string, connId: string, data: Data): Promise<Ack> {
  const conversationId = str(data.conversationId);
  const kind = callKind(data.kind);
  if (!conversationId || !kind) return { ok: false, error: "invalid" };

  // Appels à deux : réservés aux discussions à deux
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, isGroup: false, participants: { some: { userId } } },
    select: { participants: { select: { userId: true } } },
  });
  const calleeId = conversation?.participants.find((p) => p.userId !== userId)?.userId;
  if (!conversation || !calleeId) return { ok: false, error: "forbidden" };

  const block = await blockState(userId, calleeId);
  if (block.byMe || block.byThem) return { ok: false, error: "blocked" };

  await sweepCalls();
  if ((await isBusy(userId)) || (await isBusy(calleeId))) return { ok: false, error: "busy" };

  const caller = await prisma.user.findUnique({ where: { id: userId }, select: userBrief });
  if (!caller) return { ok: false, error: "forbidden" };

  const call = await prisma.call.create({
    data: { conversationId, callerId: userId, calleeId, kind, status: "RINGING", callerConnId: connId },
    select: { id: true },
  });

  await realtime.emit(`user:${calleeId}`, "call:incoming", {
    callId: call.id,
    conversationId,
    kind,
    from: caller,
  });

  // Aucun appareil connecté : notification push pour qu'il ouvre l'app
  if (!(await realtime.onlineUsers([calleeId])).has(calleeId)) {
    pushIncomingCall([calleeId], {
      title: caller.displayName,
      body: kind === "VIDEO" ? "Appel vidéo entrant" : "Appel audio entrant",
      conversationId,
      callId: call.id,
    });
  }
  return { ok: true, callId: call.id };
}

async function acceptCall(userId: string, connId: string, data: Data): Promise<Ack> {
  const callId = str(data.callId);
  if (!callId) return { ok: false };

  // Conditionnel : si un autre de mes appareils a déjà décroché, celui-ci est refusé
  const taken = await prisma.call.updateMany({
    where: { id: callId, calleeId: userId, status: "RINGING" },
    data: { status: "ACTIVE", answeredAt: new Date(), calleeConnId: connId },
  });
  if (taken.count === 0) return { ok: false };

  const call = await prisma.call.findUnique({ where: { id: callId }, select: { callerConnId: true } });
  // Mes autres appareils arrêtent de sonner
  await realtime.emit(`user:${userId}`, "call:handled", { callId }, connId);
  if (call?.callerConnId) await realtime.emit(`conn:${call.callerConnId}`, "call:accepted", { callId });
  return { ok: true };
}

async function declineCall(userId: string, data: Data): Promise<Ack> {
  const callId = str(data.callId);
  const live = callId
    ? await prisma.call.findUnique({ where: { id: callId }, select: { calleeId: true, status: true } })
    : null;
  if (!live || live.calleeId !== userId || live.status !== "RINGING") return;
  await endDirectCall(callId, "DECLINED", data.reason === "busy" ? "busy" : "declined");
}

async function endCall(userId: string, data: Data): Promise<Ack> {
  const callId = str(data.callId);
  const live = callId
    ? await prisma.call.findUnique({
        where: { id: callId },
        select: { callerId: true, calleeId: true, status: true },
      })
    : null;
  if (!live || (live.callerId !== userId && live.calleeId !== userId)) return;

  if (live.status === "ACTIVE") await endDirectCall(callId, "ENDED", "ended");
  else if (live.status === "RINGING") {
    if (live.callerId === userId) await endDirectCall(callId, "MISSED", "cancelled");
    else await endDirectCall(callId, "DECLINED", "declined");
  }
}

/** Relais des messages WebRTC (offre, réponse, candidats ICE) vers l'autre appareil */
async function callSignal(userId: string, connId: string, data: Data): Promise<Ack> {
  const callId = str(data.callId);
  const live = callId
    ? await prisma.call.findUnique({
        where: { id: callId },
        select: { callerId: true, calleeId: true, status: true, callerConnId: true, calleeConnId: true },
      })
    : null;
  if (!live || live.status !== "ACTIVE") return;

  let target: string | null = null;
  if (live.callerId === userId && live.callerConnId === connId) target = live.calleeConnId;
  else if (live.calleeId === userId && live.calleeConnId === connId) target = live.callerConnId;
  if (target) await realtime.emit(`conn:${target}`, "call:signal", { callId, data: data.data });
}

// --- Appels de groupe ---

async function startGroupCall(userId: string, connId: string, data: Data): Promise<Ack> {
  const conversationId = str(data.conversationId);
  const kind = callKind(data.kind);
  if (!conversationId || !kind) return { ok: false, error: "invalid" };

  const [conversation, caller] = await Promise.all([
    prisma.conversation.findFirst({
      where: { id: conversationId, isGroup: true, participants: { some: { userId } } },
      select: { name: true, participants: { select: { userId: true } } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: userBrief }),
  ]);
  if (!conversation || !caller) return { ok: false, error: "forbidden" };

  await sweepCalls();

  // Un seul appel de groupe à la fois par discussion : s'il existe déjà, on le rejoint
  const ongoing = await prisma.call.findFirst({
    where: { conversationId, calleeId: null, status: { in: ["RINGING", "ACTIVE"] } },
    select: { id: true },
  });
  if (ongoing) return { ok: false, error: "ongoing", callId: ongoing.id };
  if (await isBusy(userId)) return { ok: false, error: "busy" };

  const call = await prisma.call.create({
    data: {
      conversationId,
      callerId: userId,
      calleeId: null,
      kind,
      status: "RINGING",
      participants: { create: { userId, connId } },
    },
    select: { id: true },
  });

  const others = conversation.participants.map((p) => p.userId).filter((id) => id !== userId);
  await realtime.emitBatch(
    others.map((id) => ({
      rooms: `user:${id}`,
      event: "groupcall:incoming",
      payload: {
        callId: call.id,
        conversationId,
        kind,
        groupName: conversation.name ?? "Groupe",
        from: caller,
      },
    })),
  );

  // Les personnes sans appareil connecté reçoivent une notification
  const online = await realtime.onlineUsers(others);
  pushIncomingCall(
    others.filter((id) => !online.has(id)),
    {
      title: conversation.name ?? "Groupe",
      body: `${caller.displayName} lance un appel ${kind === "VIDEO" ? "vidéo" : "audio"} de groupe`,
      conversationId,
      callId: call.id,
    },
  );

  await emitGroupCallState(call.id);
  return { ok: true, callId: call.id, kind, peers: [] };
}

async function joinGroupCall(userId: string, connId: string, data: Data): Promise<Ack> {
  const callId = str(data.callId);
  const live = callId
    ? await prisma.call.findUnique({
        where: { id: callId },
        select: { conversationId: true, kind: true, status: true, calleeId: true },
      })
    : null;
  if (!live || live.calleeId !== null || (live.status !== "RINGING" && live.status !== "ACTIVE")) {
    return { ok: false, error: "gone" };
  }
  if (!(await isMember(userId, live.conversationId))) return { ok: false, error: "forbidden" };

  await sweepCalls();
  const already = await prisma.groupCallParticipant.findUnique({
    where: { callId_userId: { callId, userId } },
    select: { userId: true },
  });
  if (already) return { ok: false, error: "already" };
  if (await isBusy(userId)) return { ok: false, error: "busy" };

  const present = await prisma.groupCallParticipant.findMany({ where: { callId }, select: { userId: true, connId: true } });
  if (present.length >= MAX_GROUP_CALL_PEOPLE) return { ok: false, error: "full" };

  try {
    await prisma.groupCallParticipant.create({ data: { callId, userId, connId } });
  } catch {
    return { ok: false, error: "already" };
  }
  // Deux personnes ont pu arriver en même temps sur la dernière place : la seconde repart
  if ((await prisma.groupCallParticipant.count({ where: { callId } })) > MAX_GROUP_CALL_PEOPLE) {
    await prisma.groupCallParticipant.deleteMany({ where: { callId, userId } });
    return { ok: false, error: "full" };
  }

  try {
    const users = await prisma.user.findMany({
      where: { id: { in: [userId, ...present.map((p) => p.userId)] } },
      select: userBrief,
    });
    const joiner = users.find((u) => u.id === userId);
    if (!joiner) throw new Error("utilisateur introuvable");
    const peers = users.filter((u) => u.id !== userId);

    // Premier à rejoindre : l'appel est décroché
    await prisma.call.updateMany({
      where: { id: callId, answeredAt: null },
      data: { status: "ACTIVE", answeredAt: new Date() },
    });

    // Ceux qui sont déjà là attendent l'offre de la nouvelle personne
    await realtime.emitBatch(
      present.map((p) => ({
        rooms: `conn:${p.connId}`,
        event: "groupcall:peer-joined",
        payload: { callId, user: joiner },
      })),
    );
    // Mes autres appareils arrêtent de sonner
    await realtime.emit(`user:${userId}`, "groupcall:handled", { callId }, connId);
    await emitGroupCallState(callId);

    return { ok: true, kind: live.kind, peers };
  } catch (error) {
    console.error("[groupcall:join]", error);
    await leaveGroupCall(callId, userId, connId);
    return { ok: false, error: "server" };
  }
}

/** Relais des messages WebRTC d'un participant vers un autre */
async function groupSignal(userId: string, connId: string, data: Data): Promise<Ack> {
  const callId = str(data.callId);
  const to = str(data.to);
  if (!callId || !to) return;

  const rows = await prisma.groupCallParticipant.findMany({
    where: { callId, userId: { in: [userId, to] } },
    select: { userId: true, connId: true },
  });
  const me = rows.find((r) => r.userId === userId);
  const target = rows.find((r) => r.userId === to);
  if (!me || me.connId !== connId || !target) return;

  await realtime.emit(`conn:${target.connId}`, "groupcall:signal", { callId, from: userId, data: data.data });
}

// --- Aiguillage ---

/** Exécute une action venue du navigateur. `undefined` = rien à répondre. */
export async function handleAction(userId: string, connId: string, event: string, data: Data): Promise<Ack> {
  switch (event) {
    case "message:send":
      return sendMessage(userId, data);
    case "message:read":
      return markRead(userId, data);
    case "typing":
      return typing(userId, connId, data);
    case "call:start":
      return startCall(userId, connId, data);
    case "call:accept":
      return acceptCall(userId, connId, data);
    case "call:decline":
      return declineCall(userId, data);
    case "call:end":
      return endCall(userId, data);
    case "call:signal":
      return callSignal(userId, connId, data);
    case "groupcall:start":
      return startGroupCall(userId, connId, data);
    case "groupcall:join":
      return joinGroupCall(userId, connId, data);
    case "groupcall:signal":
      return groupSignal(userId, connId, data);
    case "groupcall:leave": {
      const callId = str(data.callId);
      if (callId) await leaveGroupCall(callId, userId, connId);
      return;
    }
    default:
      return { ok: false, error: "unknown" };
  }
}

