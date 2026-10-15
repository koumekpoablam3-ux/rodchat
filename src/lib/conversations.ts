import type { Prisma } from "@prisma/client";
import { sortConversations } from "./conversation-sort";
import { blockedByMeIds } from "./blocks";
import { postMessage, visibleMessagesWhere } from "./messages";
import { prisma } from "./prisma";
import { getRealtime } from "./realtime";
import { serializeUser, userSelect } from "./users";
import type { PinnedMessage, ConversationSummary } from "../types/chat";

// Le dernier message affiché dépend de la personne : on ne montre pas ce qu'elle a supprimé pour elle
function conversationInclude(viewerId: string) {
  return {
    participants: { include: { user: { select: userSelect } } },
    messages: {
      where: visibleMessagesWhere(viewerId),
      orderBy: { createdAt: "desc" },
      take: 1,
      include: {
        attachment: { select: { fileName: true, durationMs: true } },
        call: { select: { kind: true, status: true, durationSec: true, calleeId: true } },
      },
    },
  } satisfies Prisma.ConversationInclude;
}

type ConversationRow = Prisma.ConversationGetPayload<{
  include: ReturnType<typeof conversationInclude>;
}>;

function pinnedPreview(message: { type: string; content: string | null; attachment: { fileName: string } | null }) {
  switch (message.type) {
    case "TEXT":
      return (message.content ?? "").slice(0, 100);
    case "IMAGE":
      return "Photo";
    case "VIDEO":
      return "Vidéo";
    case "AUDIO":
      return "Message vocal";
    case "FILE":
      return message.attachment?.fileName ?? "Document";
    case "POLL":
      return `Sondage : ${(message.content ?? "").slice(0, 80)}`;
    default:
      return "";
  }
}

/** Messages épinglés de plusieurs discussions, en une seule requête (ceux que la personne peut voir) */
async function pinnedByConversation(conversationIds: string[], viewerId: string) {
  const byConversation = new Map<string, PinnedMessage[]>();
  if (conversationIds.length === 0) return byConversation;

  const rows = await prisma.message.findMany({
    where: {
      AND: [
        { conversationId: { in: conversationIds }, pinnedAt: { not: null }, deletedAt: null },
        visibleMessagesWhere(viewerId),
      ],
    },
    orderBy: { pinnedAt: "desc" },
    select: {
      id: true,
      conversationId: true,
      type: true,
      content: true,
      pinnedAt: true,
      sender: { select: { displayName: true } },
      attachment: { select: { fileName: true } },
    },
  });
  for (const row of rows) {
    const list = byConversation.get(row.conversationId) ?? [];
    list.push({
      id: row.id,
      preview: pinnedPreview(row),
      senderName: row.sender.displayName,
      pinnedAt: (row.pinnedAt as Date).toISOString(),
    });
    byConversation.set(row.conversationId, list);
  }
  return byConversation;
}

async function buildSummary(
  conv: ConversationRow,
  viewerId: string,
  blockedIds: Set<string>,
  pinnedMessages: PinnedMessage[],
): Promise<ConversationSummary> {
  const mine = conv.participants.find((p) => p.userId === viewerId);

  // Sans accusés de lecture, `readAt` reste vide : « lu » veut alors dire antérieur à lastReadAt
  const unreadCount = await prisma.messageReceipt.count({
    where: {
      userId: viewerId,
      readAt: null,
      message: {
        AND: [
          { conversationId: conv.id, deletedAt: null },
          visibleMessagesWhere(viewerId),
          ...(mine?.lastReadAt ? [{ createdAt: { gt: mine.lastReadAt } }] : []),
        ],
      },
    },
  });

  // Groupe avec des messages non lus : l'un d'eux me cite-t-il ? (badge « @ » dans la liste)
  const hasUnreadMention =
    conv.isGroup && unreadCount > 0
      ? (await prisma.messageReceipt.count({
          where: {
            userId: viewerId,
            readAt: null,
            message: {
              AND: [
                { conversationId: conv.id, deletedAt: null, mentionedIds: { has: viewerId } },
                visibleMessagesWhere(viewerId),
                ...(mine?.lastReadAt ? [{ createdAt: { gt: mine.lastReadAt } }] : []),
              ],
            },
          },
          take: 1,
        })) > 0
      : false;

  const other = conv.isGroup
    ? null
    : (conv.participants.find((p) => p.userId !== viewerId)?.user ?? null);
  const last = conv.messages[0] ?? null;

  return {
    id: conv.id,
    isGroup: conv.isGroup,
    name: conv.isGroup ? (conv.name ?? "Groupe") : (other?.displayName ?? "Utilisateur"),
    description: conv.isGroup ? conv.description : null,
    avatarUrl: conv.isGroup ? conv.avatarUrl : (other?.avatarUrl ?? null),
    participants: conv.participants.map((p) => ({ ...serializeUser(p.user), role: p.role })),
    otherUserId: other?.id ?? null,
    blockedByMe: other ? blockedIds.has(other.id) : false,
    adminsOnly: conv.adminsOnly,
    myRole: mine?.role ?? "MEMBER",
    disappearingSeconds: conv.disappearingSeconds,
    pinnedAt: mine?.pinnedAt ? mine.pinnedAt.toISOString() : null,
    archivedAt: mine?.archivedAt ? mine.archivedAt.toISOString() : null,
    mutedUntil: mine?.mutedUntil ? mine.mutedUntil.toISOString() : null,
    unreadCount,
    hasUnreadMention,
    pinnedMessages,
    lastMessage: last
      ? {
          content: last.deletedAt ? null : last.content,
          type: last.type,
          senderId: last.senderId,
          createdAt: last.createdAt.toISOString(),
          deleted: last.deletedAt !== null,
          attachment: last.deletedAt ? null : last.attachment,
          call: last.call,
        }
      : null,
    lastMessageAt: conv.lastMessageAt.toISOString(),
  };
}

export async function listConversations(viewerId: string) {
  const rows = await prisma.conversation.findMany({
    where: { participants: { some: { userId: viewerId } } },
    include: conversationInclude(viewerId),
  });
  const blockedIds = await blockedByMeIds(viewerId);
  const pinned = await pinnedByConversation(rows.map((row) => row.id), viewerId);
  const summaries: ConversationSummary[] = await Promise.all(
    rows.map((row: ConversationRow) => buildSummary(row, viewerId, blockedIds, pinned.get(row.id) ?? [])),
  );
  return sortConversations(summaries);
}

export async function getConversationSummary(conversationId: string, viewerId: string) {
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, participants: { some: { userId: viewerId } } },
    include: conversationInclude(viewerId),
  });
  if (!row) return null;
  const pinned = await pinnedByConversation([row.id], viewerId);
  return buildSummary(row, viewerId, await blockedByMeIds(viewerId), pinned.get(row.id) ?? []);
}

export async function getOrCreateDirectConversation(userId: string, otherId: string) {
  const directKey = [userId, otherId].sort().join(":");

  const existing = await prisma.conversation.findUnique({
    where: { directKey },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  try {
    const conversation = await prisma.conversation.create({
      data: {
        isGroup: false,
        directKey,
        participants: { create: [{ userId }, { userId: otherId }] },
      },
      select: { id: true },
    });
    return { id: conversation.id, created: true };
  } catch (error) {
    // Deux demandes simultanées : l'autre a gagné, on reprend la sienne
    if ((error as { code?: string }).code === "P2002") {
      const again = await prisma.conversation.findUnique({
        where: { directKey },
        select: { id: true },
      });
      if (again) return { id: again.id, created: false };
    }
    throw error;
  }
}

export async function createGroupConversation(creatorId: string, name: string, memberIds: string[]) {
  const others = Array.from(new Set(memberIds)).filter((id) => id !== creatorId);
  const conversation = await prisma.conversation.create({
    data: {
      isGroup: true,
      name,
      participants: {
        create: [
          { userId: creatorId, role: "ADMIN" },
          ...others.map((userId) => ({ userId })),
        ],
      },
    },
    select: { id: true },
  });
  return conversation.id;
}

/** Fait rejoindre la room de la conversation aux appareils déjà connectés de chaque participant */
export async function syncConversationRooms(conversationId: string) {
  const realtime = getRealtime();
  if (!realtime) return;
  const participants = await prisma.participant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  await realtime.joinUsers(
    participants.map((p) => p.userId),
    `conv:${conversationId}`,
  );
}

/** Résumé de la discussion propre à chaque membre (non lus, réglages personnels…), prêt à être diffusé */
async function summariesForMembers(conversationId: string, event: string) {
  const participants = await prisma.participant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const items = await Promise.all(
    participants.map(async ({ userId }) => {
      const summary = await getConversationSummary(conversationId, userId);
      return summary ? { rooms: `user:${userId}`, event, payload: summary } : null;
    }),
  );
  return items.filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Fait rejoindre la room de la conversation aux appareils déjà connectés
 * de chaque participant, puis leur envoie la nouvelle conversation.
 */
export async function announceConversation(conversationId: string) {
  const realtime = getRealtime();
  if (!realtime) return;

  await syncConversationRooms(conversationId);
  await realtime.emitBatch(await summariesForMembers(conversationId, "conversation:new"));
}

/** Envoie à une seule personne (tous ses appareils) l'état à jour d'une discussion */
export async function emitSummaryTo(userId: string, conversationId: string) {
  const realtime = getRealtime();
  if (!realtime) return;
  const summary = await getConversationSummary(conversationId, userId);
  if (summary) await realtime.emit(`user:${userId}`, "conversation:updated", summary);
}

/** Envoie à tous les membres l'état à jour d'une discussion (nom, photo, membres, réglages…) */
export async function broadcastConversation(conversationId: string) {
  const realtime = getRealtime();
  if (!realtime) return;
  await realtime.emitBatch(await summariesForMembers(conversationId, "conversation:updated"));
}

/** Ligne d'information au milieu de la discussion (« Léa a ajouté Marc »). Sans notification. */
export function postSystemMessage(conversationId: string, actorId: string, text: string) {
  return postMessage({
    senderId: actorId,
    conversationId,
    type: "SYSTEM",
    content: text,
    silent: true,
  });
}

/** Prénom ou nom affiché de plusieurs personnes : « A, B et C » */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}
