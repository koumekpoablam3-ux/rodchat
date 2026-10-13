import { NextResponse } from "next/server";
import { isAdminUsername } from "@/lib/admin";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Sert uniquement à afficher (ou non) le lien « Espace admin » dans le menu. Les vraies protections sont dans /admin et /api/admin.
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ admin: isAdminUsername(user?.username) }, { headers: { "Cache-Control": "no-store" } });
}
