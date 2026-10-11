import type { Prisma } from "@prisma/client";
import type { SearchHit } from "../types/chat";

// Lecture d'un message avec de quoi l'afficher hors de sa discussion : résultats de recherche, favoris
export const searchHitSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  type: true,
  content: true,
  createdAt: true,
  sender: { select: { displayName: true } },
  attachment: { select: { fileName: true } },
  conversation: {
    select: {
      isGroup: true,
      name: true,
      avatarUrl: true,
      participants: { select: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    },
  },
} satisfies Prisma.MessageSelect;

export type SearchHitRow = Prisma.MessageGetPayload<{ select: typeof searchHitSelect }>;

export function toSearchHit(row: SearchHitRow, viewerId: string): SearchHit {
  const { conversation } = row;
  const other = conversation.isGroup
    ? null
    : (conversation.participants.map((p) => p.user).find((u) => u.id !== viewerId) ?? null);
  return {
    id: row.id,
    conversationId: row.conversationId,
    conversationName: conversation.isGroup ? (conversation.name ?? "Groupe") : (other?.displayName ?? "Utilisateur"),
    conversationAvatarUrl: conversation.isGroup ? conversation.avatarUrl : (other?.avatarUrl ?? null),
    isGroup: conversation.isGroup,
    otherUserId: other?.id ?? null,
    senderId: row.senderId,
    senderName: row.sender.displayName,
    type: row.type,
    content: row.content,
    fileName: row.attachment?.fileName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
