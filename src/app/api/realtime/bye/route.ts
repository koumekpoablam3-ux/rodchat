import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// Appelé quand l'onglet se ferme (sendBeacon) ou à la déconnexion : l'appareil passe « hors ligne » tout de suite,
// sans attendre l'expiration de son signe de vie (30 s).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new NextResponse(null, { status: 204 });

  const body = (await req.json().catch(() => null)) as { conn?: unknown } | null;
  const connId = typeof body?.conn === "string" ? body.conn : "";
  if (connId) {
    await prisma.realtimeConnection.deleteMany({ where: { id: connId, userId } });
    await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return new NextResponse(null, { status: 204 });
}
