import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { isAdminUsername } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Marquer un signalement comme traité (administrateurs seulement)
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdminUsername(user.username)) return notFound("Introuvable.");

  const done = await prisma.report.updateMany({
    where: { id: params.id, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: done.count > 0 });
}
