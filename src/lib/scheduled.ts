import { BlockedError } from "./blocks";
import { postMessage } from "./messages";
import { prisma } from "./prisma";
import { getRealtime } from "./realtime";

export const MAX_SCHEDULED_PER_USER = 20;
/** Un message ne peut pas être programmé plus loin que cela */
export const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
/** Un message ne peut pas être programmé plus près que cela (le temps que la requête arrive) */
export const MIN_SCHEDULE_AHEAD_MS = 20 * 1000;

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 60 * 1000;

/**
 * Envoie les messages programmés dont l'heure est passée. Appelée par les flux temps réel (toutes les ~5 s tant que
 * quelqu'un est connecté) et par la tâche planifiée Vercel : sans personne de connecté, l'envoi attend la prochaine
 * visite (au plus tard la tâche quotidienne).
 *
 * Plusieurs fonctions peuvent passer en même temps : chaque message est « réservé » avant l'envoi (on décale son
 * heure d'une minute), donc un seul l'envoie. L'identifiant client évite tout doublon en cas de nouvel essai.
 */
export async function sendDueScheduledMessages(): Promise<number> {
  const due = await prisma.scheduledMessage.findMany({
    where: { sendAt: { lte: new Date() } },
    orderBy: { sendAt: "asc" },
    take: 20,
  });

  let sent = 0;
  for (const item of due) {
    const reserved = await prisma.scheduledMessage.updateMany({
      where: { id: item.id, sendAt: item.sendAt },
      data: { sendAt: new Date(Date.now() + RETRY_DELAY_MS), attempts: { increment: 1 } },
    });
    if (reserved.count === 0) continue;

    const fail = async (reason: "blocked" | "error") => {
      await prisma.scheduledMessage.deleteMany({ where: { id: item.id } });
      await getRealtime().emit(`user:${item.senderId}`, "scheduled:failed", {
        conversationId: item.conversationId,
        reason,
      });
    };

    try {
      const member = await prisma.participant.findUnique({
        where: { userId_conversationId: { userId: item.senderId, conversationId: item.conversationId } },
        select: { id: true },
      });
      if (!member) {
        await prisma.scheduledMessage.deleteMany({ where: { id: item.id } });
        continue;
      }
      await postMessage({
        senderId: item.senderId,
        conversationId: item.conversationId,
        type: "TEXT",
        content: item.content,
        clientId: `scheduled-${item.id}`,
      });
      await prisma.scheduledMessage.deleteMany({ where: { id: item.id } });
      sent += 1;
    } catch (error) {
      if (error instanceof BlockedError) await fail("blocked");
      else if (item.attempts + 1 >= MAX_ATTEMPTS) await fail("error");
      else console.error("[scheduled] nouvel essai dans une minute :", error instanceof Error ? error.message : error);
    }
  }
  return sent;
}
