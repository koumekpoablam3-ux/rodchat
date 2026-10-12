import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import type { StatusViewer } from "@/types/status";

export const dynamic = "force-dynamic";

// Qui a vu mon statut (réservé à son auteur)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const status = await prisma.status.findFirst({
    where: { id: params.id, authorId: userId },
    select: {
      views: {
        orderBy: { viewedAt: "desc" },
        select: { viewedAt: true, user: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
    },
  });
  if (!status) return notFound("Ce statut n'existe plus.");

  const viewers: StatusViewer[] = status.views.map((v) => ({ user: v.user, viewedAt: v.viewedAt.toISOString() }));
  return NextResponse.json({ viewers });
}
