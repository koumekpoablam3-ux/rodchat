import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

// Annuler un message programmé
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const removed = await prisma.scheduledMessage.deleteMany({ where: { id: params.id, senderId: userId } });
  if (removed.count === 0) return notFound("Ce message n'est plus programmé.");
  return NextResponse.json({ ok: true });
}
