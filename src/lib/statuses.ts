import { blockState } from "./blocks";
import { prisma } from "./prisma";
import { getRealtime } from "./realtime";

/**
 * Mes « contacts » pour les statuts : les personnes avec qui j'ai une discussion à deux,
 * sauf celles que j'ai bloquées ou qui m'ont bloqué. La relation est symétrique.
 */
export async function statusContactIds(me: string): Promise<string[]> {
  const conversations = await prisma.conversation.findMany({
    where: { isGroup: false, participants: { some: { userId: me } } },
    select: { participants: { select: { userId: true } } },
  });
  const ids = new Set(conversations.flatMap((c) => c.participants.map((p) => p.userId)).filter((id) => id !== me));
  if (ids.size === 0) return [];

  const list = Array.from(ids);
  const blocks = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: me, blockedId: { in: list } },
        { blockedId: me, blockerId: { in: list } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  for (const block of blocks) ids.delete(block.blockerId === me ? block.blockedId : block.blockerId);
  return Array.from(ids);
}

/** Cette personne peut-elle voir les statuts de cet auteur ? */
export async function canSeeStatusesOf(viewerId: string, authorId: string): Promise<boolean> {
  if (viewerId === authorId) return true;
  const conversation = await prisma.conversation.findUnique({
    where: { directKey: [viewerId, authorId].sort().join(":") },
    select: { id: true },
  });
  if (!conversation) return false;
  const state = await blockState(viewerId, authorId);
  return !state.byMe && !state.byThem;
}

/** Prévient les contacts (et mes autres appareils) qu'un statut est apparu ou a disparu : ils rechargent leur liste */
export async function notifyStatusChange(authorId: string) {
  const contacts = await statusContactIds(authorId);
  await getRealtime().emit([`user:${authorId}`, ...contacts.map((id) => `user:${id}`)], "status:updated", {
    authorId,
  });
}
