import { NextResponse } from "next/server";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { getSessionInfo, revokeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Déconnecter un de mes appareils (pas celui-ci : pour lui, il y a « Se déconnecter »)
export async function DELETE(_req: Request, { params }: { params: { sid: string } }) {
  const info = await getSessionInfo();
  if (!info) return unauthorized();
  if (params.sid === info.sessionId) return badRequest("C'est l'appareil que tu utilises : utilise « Se déconnecter ».");

  const removed = await revokeSession(params.sid, info.userId);
  if (!removed) return notFound("Cet appareil n'est plus connecté.");
  return NextResponse.json({ ok: true });
}
