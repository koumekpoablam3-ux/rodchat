import { NextResponse } from "next/server";
import { isAdminUsername } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Sert à afficher (ou non) le lien « Espace admin » dans le menu, avec le nombre de choses à traiter
// (signalements et demandes de mot de passe). Les vraies protections sont dans /admin et /api/admin.
export async function GET() {
  const user = await getSessionUser();
  if (!isAdminUsername(user?.username)) {
    return NextResponse.json({ admin: false, pending: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  const [reports, passwords] = await Promise.all([
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.passwordResetRequest.count({ where: { status: "PENDING" } }),
  ]);
  return NextResponse.json({ admin: true, pending: reports + passwords }, { headers: { "Cache-Control": "no-store" } });
}
