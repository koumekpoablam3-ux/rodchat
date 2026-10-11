import { NextResponse } from "next/server";
import { purgeExpiredMessages } from "@/lib/expiry";
import { purgeOldEvents } from "@/lib/realtime";

// Messages éphémères et ménage du temps réel. Les flux temps réel s'en chargent déjà toutes les minutes tant que
// quelqu'un est connecté ; cette tâche planifiée par Vercel (vercel.json, une fois par jour) nettoie le reste.
// Vercel l'appelle avec « Authorization: Bearer <CRON_SECRET> ».
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const purged = await purgeExpiredMessages();
  await purgeOldEvents();
  return NextResponse.json({ purged });
}
