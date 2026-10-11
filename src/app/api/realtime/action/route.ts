import { NextResponse } from "next/server";
import { badRequest, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { handleAction } from "@/lib/rt-actions";
import { getSessionUserId } from "@/lib/session";

// Tout ce que le navigateur envoyait par socket.emit(...) : messages texte, accusés de lecture, « en train
// d'écrire » et signalisation des appels. La personne vient du cookie de session, jamais du corps de la requête.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CONN_ID = /^[A-Za-z0-9_-]{8,64}$/;

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  // Large : la signalisation d'un appel envoie des dizaines de messages en quelques secondes
  const limit = rateLimit(`rt:${userId}`, 1500, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const body = (await req.json().catch(() => null)) as { conn?: unknown; event?: unknown; data?: unknown } | null;
  const event = typeof body?.event === "string" ? body.event : "";
  const connId = typeof body?.conn === "string" ? body.conn : "";
  if (!event || !CONN_ID.test(connId)) return badRequest("Requête invalide.");
  const data = (typeof body?.data === "object" && body.data !== null ? body.data : {}) as Record<string, unknown>;

  // Les actions d'appel visent un onglet précis : il doit être le mien
  if (event.startsWith("call:") || event.startsWith("groupcall:")) {
    const mine = await prisma.realtimeConnection.findFirst({ where: { id: connId, userId }, select: { id: true } });
    if (!mine) return NextResponse.json({ ack: { ok: false, error: "no_connection" } }, { status: 200 });
  }

  try {
    const ack = await handleAction(userId, connId, event, data);
    return NextResponse.json({ ack: ack ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[realtime:${event}]`, error);
    return NextResponse.json({ ack: { ok: false, error: "server" } }, { status: 200 });
  }
}
