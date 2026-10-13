import { prisma } from "./prisma";
import { getRealtime } from "./realtime";
import { forgetSessionVersion } from "./session";

/**
 * Supprime définitivement un compte : le profil, les messages, et les discussions à deux (qui n'ont plus de sens
 * sans lui). Les autres participants voient la discussion disparaître. Utilisé par la suppression de son propre
 * compte et par l'espace admin.
 */
export async function deleteUserAccount(userId: string) {
  const direct = await prisma.conversation.findMany({
    where: { isGroup: false, participants: { some: { userId } } },
    select: { id: true, participants: { select: { userId: true } } },
  });
  await prisma.conversation.deleteMany({ where: { id: { in: direct.map((c) => c.id) } } });
  await prisma.user.delete({ where: { id: userId } });

  await getRealtime().emitBatch(
    direct.flatMap((conversation) =>
      conversation.participants
        .filter((p) => p.userId !== userId)
        .map((p) => ({ rooms: `user:${p.userId}`, event: "conversation:removed", payload: { id: conversation.id } })),
    ),
  );
  forgetSessionVersion(userId);
}
