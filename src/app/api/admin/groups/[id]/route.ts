import { NextResponse } from "next/server";
import { logAdmin, requireAdmin } from "@/lib/admin";
import { notFound } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Supprimer un groupe (et tous ses messages) : les membres le voient disparaître
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const group = await prisma.conversation.findFirst({
    where: { id: params.id, isGroup: true },
    select: { id: true, name: true, participants: { select: { userId: true } } },
  });
  if (!group) return notFound("Ce groupe n'existe plus.");

  await prisma.conversation.delete({ where: { id: group.id } });
  await getRealtime().emitBatch(
    group.participants.map((p) => ({
      rooms: `user:${p.userId}`,
      event: "conversation:removed",
      payload: { id: group.id },
    })),
  );
  await logAdmin(auth.admin, "Groupe supprimé", { id: group.id, name: group.name }, `${group.participants.length} membre(s)`);
  return NextResponse.json({ ok: true });
}
