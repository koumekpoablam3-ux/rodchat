import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { notifyStatusChange } from "@/lib/statuses";

export const dynamic = "force-dynamic";

// Supprimer un de mes statuts
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const removed = await prisma.status.deleteMany({ where: { id: params.id, authorId: userId } });
  if (removed.count === 0) return notFound("Ce statut n'existe plus.");

  await notifyStatusChange(userId);
  return NextResponse.json({ ok: true });
}
