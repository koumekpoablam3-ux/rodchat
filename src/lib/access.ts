import { prisma } from "./prisma";

/** La personne fait-elle partie de la discussion ? Renvoie sa fiche de participant, sinon null. */
export function getMembership(userId: string, conversationId: string) {
  return prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    include: { conversation: { select: { isGroup: true, name: true } } },
  });
}

export async function displayNameOf(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  return user?.displayName ?? "Quelqu'un";
}
