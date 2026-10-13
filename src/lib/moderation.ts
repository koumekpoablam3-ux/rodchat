import { Prisma } from "@prisma/client";
import { broadcastMessageUpdate, loadMessage } from "./messages";
import { prisma } from "./prisma";

/**
 * Suppression d'un message par la modération : comme « supprimer pour tous » (le contenu, le fichier et les
 * réactions disparaissent vraiment, il reste une trace « message supprimé »), sans la limite de 48 h.
 */
export async function deleteMessageAsModerator(messageId: string): Promise<boolean> {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true, deletedAt: true } });
  if (!message) return false;
  if (message.deletedAt) return true;

  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { messageId } }),
    prisma.reaction.deleteMany({ where: { messageId } }),
    prisma.starredMessage.deleteMany({ where: { messageId } }),
    prisma.message.update({
      where: { id: messageId },
      data: { content: null, deletedAt: new Date(), editedAt: null, linkPreview: Prisma.DbNull, pinnedAt: null, pinnedById: null },
    }),
  ]);
  const updated = await loadMessage(messageId);
  if (updated) await broadcastMessageUpdate(updated);
  return true;
}
