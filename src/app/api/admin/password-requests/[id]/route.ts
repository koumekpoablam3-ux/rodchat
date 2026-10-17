import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUsername, logAdmin, requireAdmin } from "@/lib/admin";
import { badRequest, notFound } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { forgetSessionVersion } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["approve", "reject"]) });

// Approuver ou refuser une demande de nouveau mot de passe.
// Approuver : le mot de passe choisi par la personne devient celui du compte, et tous ses appareils sont déconnectés.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Action invalide.");

  const request = await prisma.passwordResetRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      userId: true,
      newPasswordHash: true,
      user: { select: { id: true, username: true, displayName: true } },
    },
  });
  if (!request) return notFound("Cette demande n'existe plus.");
  if (request.status !== "PENDING") return badRequest("Cette demande a déjà été traitée.");
  if (isAdminUsername(request.user.username)) {
    return badRequest("Les comptes administrateurs ne passent pas par ce circuit.");
  }

  const who = { id: request.user.id, name: `${request.user.displayName} (@${request.user.username})` };
  const now = new Date();

  if (parsed.data.action === "reject") {
    await prisma.passwordResetRequest.update({ where: { id: request.id }, data: { status: "REJECTED", resolvedAt: now } });
    await logAdmin(admin, "Demande de mot de passe refusée", who);
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: request.userId },
      data: { passwordHash: request.newPasswordHash, sessionVersion: { increment: 1 } },
    }),
    prisma.passwordResetRequest.update({ where: { id: request.id }, data: { status: "APPROVED", resolvedAt: now } }),
    // Les autres demandes en attente pour ce compte n'ont plus lieu d'être
    prisma.passwordResetRequest.updateMany({
      where: { userId: request.userId, status: "PENDING", id: { not: request.id } },
      data: { status: "REJECTED", resolvedAt: now },
    }),
  ]);
  forgetSessionVersion(request.userId);
  await logAdmin(admin, "Demande de mot de passe approuvée", who);
  return NextResponse.json({ ok: true });
}
