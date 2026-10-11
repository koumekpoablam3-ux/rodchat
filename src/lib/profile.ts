import { prisma } from "./prisma";
import { getRealtime } from "./realtime";
import { serializeUser, userSelect } from "./users";

/** Prévient les contacts (et mes autres appareils) que mon profil a changé */
export async function broadcastUser(userId: string) {
  const realtime = getRealtime();
  if (!realtime) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) return;

  const memberships = await prisma.participant.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  const rooms = [`user:${userId}`, ...memberships.map((m) => `conv:${m.conversationId}`)];
  await realtime.emit(rooms, "user:updated", serializeUser(user));
}
