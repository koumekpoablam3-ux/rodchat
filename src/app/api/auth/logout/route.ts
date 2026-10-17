import { NextResponse } from "next/server";
import { endSession, getSessionInfo, revokeSession } from "@/lib/session";

export async function POST() {
  // L'appareil disparaît de la liste « Appareils connectés »
  const info = await getSessionInfo().catch(() => null);
  if (info?.sessionId) await revokeSession(info.sessionId, info.userId).catch(() => {});
  endSession();
  return NextResponse.json({ ok: true });
}
