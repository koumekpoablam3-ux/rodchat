import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUsername, logAdmin, requireAdmin } from "@/lib/admin";
import { badRequest, notFound } from "@/lib/api";
import { deleteMessageAsModerator } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";
import { forgetSessionVersion } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["resolve", "delete-message", "suspend-user"]).default("resolve") });

// Traiter un signalement : le classer, supprimer le message signalé, ou suspendre la personne signalée
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Action invalide.");

  const report = await prisma.report.findUnique({ where: { id: params.id } });
  if (!report) return notFound("Ce signalement n'existe plus.");

  if (parsed.data.action === "delete-message") {
    if (!report.messageId) return badRequest("Ce signalement ne concerne pas un message.");
    await deleteMessageAsModerator(report.messageId);
    await logAdmin(admin, "Message supprimé (signalement)", { id: report.messageId, name: report.targetName }, report.messageExcerpt ?? undefined);
  }

  if (parsed.data.action === "suspend-user") {
    const target = report.targetUserId
      ? await prisma.user.findUnique({ where: { id: report.targetUserId }, select: { id: true, username: true, displayName: true } })
      : null;
    if (!target) return notFound("Cette personne n'existe plus.");
    if (isAdminUsername(target.username)) return badRequest("Les comptes administrateurs ne peuvent pas être suspendus ici.");
    await prisma.user.update({
      where: { id: target.id },
      data: { suspendedAt: new Date(), suspendedReason: `Signalement : ${report.reason}`, sessionVersion: { increment: 1 } },
    });
    await prisma.realtimeConnection.deleteMany({ where: { userId: target.id } });
    forgetSessionVersion(target.id);
    await logAdmin(admin, "Compte suspendu (signalement)", { id: target.id, name: `${target.displayName} (@${target.username})` }, report.reason);
  }

  await prisma.report.update({ where: { id: report.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  await logAdmin(admin, "Signalement traité", { id: report.id, name: report.targetName }, `Motif : ${report.reason}`);
  return NextResponse.json({ ok: true });
}
