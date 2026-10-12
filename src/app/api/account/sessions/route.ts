import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { forgetSessionVersion, getSessionUserId, startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Déconnecter tous les autres appareils (celui-ci reste connecté)
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  forgetSessionVersion(userId);
  await startSession(userId);
  return NextResponse.json({ ok: true });
}
