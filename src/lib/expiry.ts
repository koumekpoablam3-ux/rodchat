import { prisma } from "./prisma";
import { getRealtime } from "./realtime";

/**
 * Messages éphémères : supprime pour de bon les messages dont la durée de vie est dépassée
 * (le fichier, les accusés et les réactions partent avec, par cascade) et prévient les appareils connectés.
 * Les lectures ignorent déjà ces messages : ce nettoyage sert surtout à libérer de la place.
 */
export async function purgeExpiredMessages() {
  const expired = await prisma.message.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true, conversationId: true },
    take: 500,
  });
  if (expired.length === 0) return 0;

  await prisma.message.deleteMany({ where: { id: { in: expired.map((m) => m.id) } } });

  const byConversation = new Map<string, string[]>();
  for (const { id, conversationId } of expired) {
    byConversation.set(conversationId, [...(byConversation.get(conversationId) ?? []), id]);
  }
  await getRealtime()?.emitBatch(
    Array.from(byConversation, ([conversationId, ids]) => ({
      rooms: `conv:${conversationId}`,
      event: "message:expired",
      payload: { conversationId, ids },
    })),
  );
  return expired.length;
}
