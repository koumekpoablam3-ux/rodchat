import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { deleteUserAccount } from "@/lib/account";
import { isAdminUsername, logAdmin, requireAdmin } from "@/lib/admin";
import { badRequest, notFound } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { forgetSessionVersion } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["suspend", "unsuspend", "delete", "reset-password", "logout"]),
  reason: z.string().trim().max(200).optional(),
});

// Gérer un compte : suspendre, réactiver, supprimer, réinitialiser le mot de passe, déconnecter partout
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Action invalide.");
  const { action, reason } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, username: true, displayName: true },
  });
  if (!target) return notFound("Ce compte n'existe plus.");
  // Garde-fou : un administrateur ne peut pas se modifier ni modifier un autre administrateur d'ici
  if (isAdminUsername(target.username)) {
    return badRequest("Les comptes administrateurs ne peuvent pas être modifiés depuis l'espace admin.");
  }
  const who = { id: target.id, name: `${target.displayName} (@${target.username})` };

  switch (action) {
    case "suspend": {
      await prisma.user.update({
        where: { id: target.id },
        data: { suspendedAt: new Date(), suspendedReason: reason || null, sessionVersion: { increment: 1 } },
      });
      // Il apparaît tout de suite hors ligne ; ses appareils sont déconnectés en quelques secondes
      await prisma.realtimeConnection.deleteMany({ where: { userId: target.id } });
      forgetSessionVersion(target.id);
      await logAdmin(admin, "Compte suspendu", who, reason);
      return NextResponse.json({ ok: true });
    }
    case "unsuspend": {
      await prisma.user.update({ where: { id: target.id }, data: { suspendedAt: null, suspendedReason: null } });
      forgetSessionVersion(target.id);
      await logAdmin(admin, "Compte réactivé", who);
      return NextResponse.json({ ok: true });
    }
    case "logout": {
      await prisma.user.update({ where: { id: target.id }, data: { sessionVersion: { increment: 1 } } });
      forgetSessionVersion(target.id);
      await logAdmin(admin, "Appareils déconnectés", who);
      return NextResponse.json({ ok: true });
    }
    case "reset-password": {
      // Mot de passe temporaire affiché une seule fois à l'administrateur, qui le transmet à la personne
      const password = randomBytes(9).toString("base64url");
      await prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: await hash(password, 10), sessionVersion: { increment: 1 } },
      });
      forgetSessionVersion(target.id);
      await logAdmin(admin, "Mot de passe réinitialisé", who);
      return NextResponse.json({ ok: true, password });
    }
    case "delete": {
      await deleteUserAccount(target.id);
      await logAdmin(admin, "Compte supprimé", who, reason);
      return NextResponse.json({ ok: true });
    }
  }
}
