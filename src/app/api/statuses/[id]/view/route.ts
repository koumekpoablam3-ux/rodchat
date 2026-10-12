import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { canSeeStatusesOf } from "@/lib/statuses";

export const dynamic = "force-dynamic";

// J'ai vu ce statut (l'auteur le saura)
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const status = await prisma.status.findFirst({
    where: { id: params.id, expiresAt: { gt: new Date() } },
    select: { authorId: true },
  });
  if (!status || !(await canSeeStatusesOf(userId, status.authorId))) return notFound("Ce statut n'existe plus.");
  if (status.authorId === userId) return NextResponse.json({ ok: true });

  await prisma.statusView.upsert({
    where: { statusId_userId: { statusId: params.id, userId } },
    create: { statusId: params.id, userId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
