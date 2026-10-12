import { prisma } from "./prisma";

/** Message refusé parce que l'un des deux a bloqué l'autre */
export class BlockedError extends Error {
  constructor(public readonly byMe: boolean) {
    super(byMe ? "blocked_by_me" : "blocked");
  }
}

export const blockedMessage = (byMe: boolean) =>
  byMe
    ? "Tu as bloqué cette personne. Débloque-la pour lui écrire."
    : "Tu ne peux pas écrire à cette personne.";

/** Qui a bloqué qui entre deux personnes (la personne bloquée n'apprend rien de plus que « impossible d'écrire ») */
export async function blockState(me: string, other: string) {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: me, blockedId: other }, { blockerId: other, blockedId: me }] },
    select: { blockerId: true },
  });
  return { byMe: rows.some((r) => r.blockerId === me), byThem: rows.some((r) => r.blockerId === other) };
}

/** Dans une discussion à deux : lève BlockedError si l'un a bloqué l'autre. Sans effet dans un groupe. */
export async function assertCanMessage(senderId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isGroup: true, participants: { select: { userId: true } } },
  });
  if (!conversation || conversation.isGroup) return;
  const otherId = conversation.participants.find((p) => p.userId !== senderId)?.userId;
  if (!otherId) return;
  const state = await blockState(senderId, otherId);
  if (state.byMe || state.byThem) throw new BlockedError(state.byMe);
}

/** Les personnes que j'ai bloquées */
export async function blockedByMeIds(me: string): Promise<Set<string>> {
  const rows = await prisma.block.findMany({ where: { blockerId: me }, select: { blockedId: true } });
  return new Set(rows.map((r) => r.blockedId));
}
