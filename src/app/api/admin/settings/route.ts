import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdmin, requireAdmin } from "@/lib/admin";
import { badRequest } from "@/lib/api";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const schema = z.object({
  registrationMode: z.enum(["open", "invite", "closed"]),
  inviteCode: z.string().trim().max(100).optional().default(""),
  directory: z.enum(["on", "off"]).optional().default("on"),
  announcement: z.string().trim().max(300, "L'annonce est trop longue (300 caractères maximum).").optional().default(""),
});

// Réglages de la plateforme : qui peut s'inscrire, et l'annonce affichée à tout le monde
export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const { registrationMode, inviteCode, announcement, directory } = parsed.data;

  if (registrationMode === "invite" && !inviteCode) {
    return badRequest("Choisis un code d'invitation, ou passe l'inscription en « ouverte » ou « fermée ».");
  }
  if (/[\s&#?]/.test(inviteCode)) {
    return badRequest("Le code d'invitation ne doit contenir ni espace ni & # ? (il sert dans un lien).");
  }

  await setSetting("registration_mode", registrationMode);
  await setSetting("invite_code", registrationMode === "invite" ? inviteCode : null);
  await setSetting("announcement", announcement);
  await setSetting("directory", directory === "off" ? "off" : null);

  await logAdmin(auth.admin, "Réglages modifiés", undefined, `Inscription : ${registrationMode}${announcement ? " · annonce publiée" : " · pas d'annonce"} · annuaire ${directory === "off" ? "masqué" : "visible"}`);
  return NextResponse.json({ ok: true });
}
