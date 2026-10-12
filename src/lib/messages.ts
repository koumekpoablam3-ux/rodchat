import type { Prisma } from "@prisma/client";
import { background } from "./background";
import { assertCanMessage } from "./blocks";
import { fetchLinkPreview, firstUrl } from "./link-preview";
import { extractMentions } from "./mentions";
import { prisma } from "./prisma";
import { sendPushToUsers } from "./push";
import { getRealtime } from "./realtime";
import type { MessageType } from "../types/chat";

// Ce qu'on lit du message cité dans une réponse
export const quotedSelect = {
  id: true,
  type: true,
  content: true,
  senderId: true,
  deletedAt: true,
  sender: { select: { displayName: true } },
  attachment: { select: { fileName: true } },
} satisfies Prisma.MessageSelect;

// Ce qu'on lit d'un message : jamais les octets du fichier, seulement ses métadonnées
export const messageInclude = {
  sender: { select: { id: true, displayName: true, avatarUrl: true } },
  receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
  attachment: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      durationMs: true,
      width: true,
      height: true,
    },
  },
  call: { select: { kind: true, status: true, durationSec: true, calleeId: true } },
  reactions: { select: { userId: true, emoji: true } },
  replyTo: { select: quotedSelect },
} satisfies Prisma.MessageInclude;

export type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

/**
 * Messages que cette personne a le droit de voir :
 * - pas ceux qu'elle a supprimés « pour moi »,
 * - pas ceux dont la durée de vie est dépassée (messages éphémères),
 * - dans un groupe, pas ceux d'avant son arrivée (`joinedAt`).
 */
export function visibleMessagesWhere(viewerId: string, joinedAt?: Date): Prisma.MessageWhereInput {
  const conditions: Prisma.MessageWhereInput[] = [
    { hides: { none: { userId: viewerId } } },
    { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  ];
  if (joinedAt) conditions.push({ createdAt: { gte: joinedAt } });
  return { AND: conditions };
}

export type AttachmentInput = {
  fileName: string;
  mimeType: string;
  size: number;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  data: Uint8Array<ArrayBuffer>;
};

export type PostMessageInput = {
  senderId: string;
  conversationId: string;
  type: MessageType;
  content?: string | null;
  clientId?: string;
  attachment?: AttachmentInput;
  callId?: string;
  /** Message déjà lu et sans notification (journal d'un appel qui a abouti, message système) */
  silent?: boolean;
  /** Identifiant du message auquel on répond */
  replyToId?: string | null;
  /** Message transféré depuis une autre discussion */
  forwarded?: boolean;
};

function pushBody(message: MessageWithRelations) {
  switch (message.type) {
    case "TEXT":
      return (message.content ?? "").slice(0, 140);
    case "IMAGE":
      return "Photo";
    case "AUDIO":
      return "Message vocal";
    case "VIDEO":
      return "Vidéo";
    case "FILE":
      return message.attachment ? `Document : ${message.attachment.fileName}` : "Document";
    case "CALL":
      return message.call?.kind === "VIDEO" ? "Appel vidéo manqué" : "Appel audio manqué";
    default:
      return "Nouveau message";
  }
}

async function notifyOffline(userIds: string[], message: MessageWithRelations, mention = false) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: message.conversationId },
    select: { isGroup: true, name: true },
  });
  const body = pushBody(message);
  await sendPushToUsers(userIds, {
    title: conversation?.isGroup ? (conversation.name ?? "Groupe") : message.sender.displayName,
    body: mention
      ? `${message.sender.displayName} t'a mentionné : ${body}`
      : conversation?.isGroup
        ? `${message.sender.displayName} : ${body}`
        : body,
    url: `/chat/${message.conversationId}`,
    tag: mention ? `${message.conversationId}:mention` : message.conversationId,
  });
}

/**
 * Enregistre un message (texte, fichier, vocal, appel ou message système), le diffuse en temps réel
 * aux participants et notifie ceux qui n'ont aucun appareil connecté (sauf en sourdine).
 * Utilisé par /api/realtime/action (messages texte) et par les routes API.
 */
export async function postMessage(input: PostMessageInput): Promise<MessageWithRelations> {
  const {
    senderId,
    conversationId,
    type,
    content = null,
    clientId,
    attachment,
    callId,
    silent,
    replyToId,
    forwarded = false,
  } = input;

  const realtime = getRealtime();

  // Même message renvoyé (reconnexion, nouvel essai) : on renvoie l'existant
  const findExisting = () =>
    clientId
      ? prisma.message.findUnique({
          where: { senderId_clientId: { senderId, clientId } },
          include: messageInclude,
        })
      : null;

  const existing = await findExisting();
  if (existing) return existing;

  // Discussion à deux avec une personne bloquée (ou qui m'a bloqué) : rien ne part.
  // Les lignes d'appel et les messages système restent possibles.
  if (!silent && type !== "SYSTEM" && type !== "CALL") await assertCanMessage(senderId, conversationId);

  const [others, conversation, replyTarget] = await Promise.all([
    prisma.participant.findMany({
      where: { conversationId, NOT: { userId: senderId } },
      select: { userId: true, mutedUntil: true },
    }),
    prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { disappearingSeconds: true },
    }),
    // On ne cite qu'un message de la même discussion
    replyToId
      ? prisma.message.findFirst({ where: { id: replyToId, conversationId }, select: { id: true } })
      : null,
  ]);

  // Qui a un appareil connecté : ceux-là reçoivent le message tout de suite, les autres une notification push
  const online = realtime ? await realtime.onlineUsers(others.map((o) => o.userId)) : new Set<string>();
  const isOnline = (userId: string) => online.has(userId);

  const now = new Date();
  // Messages éphémères : tout sauf les appels et les messages système
  const ttl = conversation?.disappearingSeconds ?? null;
  const expiresAt =
    ttl !== null && type !== "SYSTEM" && type !== "CALL" ? new Date(now.getTime() + ttl * 1000) : null;

  // « @pseudo » dans un texte : on retrouve les membres cités
  let mentionedIds: string[] = [];
  if (type === "TEXT" && content && content.includes("@")) {
    const handles = extractMentions(content);
    if (handles.length > 0) {
      const cited = await prisma.participant.findMany({
        where: { conversationId, userId: { not: senderId }, user: { username: { in: handles } } },
        select: { userId: true },
      });
      mentionedIds = cited.map((c) => c.userId);
    }
  }

  let message: MessageWithRelations;
  try {
    message = await prisma.message.create({
      data: {
        conversationId,
        mentionedIds,
        senderId,
        type,
        content,
        clientId,
        callId,
        forwarded,
        expiresAt,
        replyToId: replyTarget?.id ?? null,
        ...(attachment ? { attachment: { create: attachment } } : {}),
        receipts: {
          create: others.map((o) => ({
            userId: o.userId,
            deliveredAt: silent || isOnline(o.userId) ? now : null,
            readAt: silent ? now : null,
          })),
        },
      },
      include: messageInclude,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const again = await findExisting();
      if (again) return again;
    }
    throw error;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt },
  });

  await realtime?.emit(`conv:${conversationId}`, "message:new", message);

  // L'aperçu d'un lien arrive un instant après : le message part sans attendre le site visité
  scheduleLinkPreview(message);

  if (!silent) {
    const offlineOthers = others.filter((o) => !isOnline(o.userId));
    // Une mention prévient même si la discussion est en sourdine
    const mentioned = offlineOthers.filter((o) => mentionedIds.includes(o.userId)).map((o) => o.userId);
    const regular = offlineOthers
      .filter((o) => !mentionedIds.includes(o.userId) && !(o.mutedUntil && o.mutedUntil > now))
      .map((o) => o.userId);
    if (regular.length > 0) background(notifyOffline(regular, message));
    if (mentioned.length > 0) background(notifyOffline(mentioned, message, true));
  }

  return message;
}

/** Relit un message avec toutes ses relations */
export function loadMessage(id: string) {
  return prisma.message.findUnique({ where: { id }, include: messageInclude });
}

/** Diffuse un message modifié (texte changé, supprimé, réaction) à toute la discussion */
export async function broadcastMessageUpdate(message: MessageWithRelations) {
  await getRealtime()?.emit(`conv:${message.conversationId}`, "message:updated", message);
}

/** Cherche l'aperçu du premier lien d'un message texte, puis prévient la discussion */
export async function attachLinkPreview(messageId: string, content: string) {
  const url = firstUrl(content);
  if (!url) return;
  const preview = await fetchLinkPreview(url);
  if (!preview) return;

  // Pendant la recherche, le message a pu être modifié ou supprimé
  const current = await prisma.message.findUnique({
    where: { id: messageId },
    select: { content: true, deletedAt: true },
  });
  if (!current || current.deletedAt || current.content !== content) return;

  await prisma.message.update({
    where: { id: messageId },
    data: { linkPreview: preview as unknown as Prisma.InputJsonObject },
  });
  const updated = await loadMessage(messageId);
  if (updated) await broadcastMessageUpdate(updated);
}

export function scheduleLinkPreview(message: { id: string; type: string; content: string | null }) {
  if (message.type !== "TEXT" || !message.content || !firstUrl(message.content)) return;
  // Sur Vercel la fonction serait gelée dès sa réponse : `background` la garde en vie le temps de l'aperçu
  background(attachLinkPreview(message.id, message.content));
}
