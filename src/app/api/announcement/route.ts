import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Annonce de l'administrateur, affichée aux personnes connectées
export async function GET() {
  if (!(await getSessionUserId())) return NextResponse.json({ text: null });
  const text = await getSetting("announcement");
  return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
}
