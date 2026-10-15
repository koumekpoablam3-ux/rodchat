import { NextResponse } from "next/server";
import { forbidden, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import type { MessageInfo } from "@/types/chat";

export const dynamic = "force-dynamic";

// Infos d'un de mes messages : qui l'a reçu, qui l'a lu et quand. Les personnes qui ont désactivé leurs accusés de
// lecture apparaissent « reçu » mais jamais « lu » : leur choix est respecté.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const message = await prisma.message.findUnique({
    where: { id: params.id },
    select: { senderId: true, createdAt: true, deletedAt: true },
  });
  if (!message || message.deletedAt) return notFound("Ce message n'existe plus.");
  if (message.senderId !== userId) return forbidden();

  const receipts = await prisma.messageReceipt.findMany({
    where: { messageId: params.id },
    select: { userId: true, deliveredAt: true, readAt: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: receipts.map((r) => r.userId) } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const recipients = receipts
    .flatMap((r) => {
      const user = byId.get(r.userId);
      return user
        ? [{ user, deliveredAt: r.deliveredAt?.toISOString() ?? null, readAt: r.readAt?.toISOString() ?? null }]
        : [];
    })
    // Lus d'abord (le plus récent en premier), puis reçus, puis en attente
    .sort((a, b) => {
      const rank = (x: typeof a) => (x.readAt ? 0 : x.deliveredAt ? 1 : 2);
      return rank(a) - rank(b) || (b.readAt ?? b.deliveredAt ?? "").localeCompare(a.readAt ?? a.deliveredAt ?? "");
    });

  const info: MessageInfo = { sentAt: message.createdAt.toISOString(), recipients };
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
