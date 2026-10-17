import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { forgetSessionVersion, getSessionInfo, getSessionUserId, startSession } from "@/lib/session";

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

// Mes appareils connectés : un par connexion, le plus récemment actif en premier
export async function GET() {
  const info = await getSessionInfo();
  if (!info) return unauthorized();

  // Connexion d'avant cette fonction : on l'enregistre maintenant pour qu'elle apparaisse (et puisse être reconnue)
  const currentId = info.sessionId ?? (await startSession(info.userId));

  const user = await prisma.user.findUnique({ where: { id: info.userId }, select: { sessionVersion: true } });
  const rows = await prisma.session.findMany({
    where: { userId: info.userId, version: user?.sessionVersion ?? 0 },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
    select: { id: true, label: true, createdAt: true, lastSeenAt: true },
  });

  return NextResponse.json(
    {
      sessions: rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        current: row.id === currentId,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
