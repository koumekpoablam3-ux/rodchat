import { prisma } from "./prisma";

/** Message refusé parce que l'un des deux a bloqué l'autre */
export class BlockedError extends Error {
  /** Phrase à montrer à la personne qui voulait écrire */
  readonly userMessage: string;
  constructor(
    public readonly byMe: boolean,
    userMessage?: string,
  ) {
    super(byMe ? "blocked_by_me" : "blocked");
    this.userMessage = userMessage ?? blockedMessage(byMe);
  }
}

/** Groupe en mode annonce : seuls les admins peuvent écrire */
export class AdminsOnlyError extends BlockedError {
  constructor() {
    super(false, "Seuls les admins peuvent envoyer des messages dans ce groupe.");
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

/** Lève BlockedError si l'envoi est refusé : un blocage dans une discussion à deux, ou le mode annonce dans un groupe. */
export async function assertCanMessage(senderId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isGroup: true, adminsOnly: true, participants: { select: { userId: true, role: true } } },
  });
  if (!conversation) return;

  if (conversation.isGroup) {
    // Mode annonce : seuls les admins écrivent
    const mine = conversation.participants.find((p) => p.userId === senderId);
    if (conversation.adminsOnly && mine?.role !== "ADMIN") throw new AdminsOnlyError();
    return;
  }

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
