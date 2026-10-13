import { prisma } from "./prisma";

// Petits réglages de la plateforme stockés en base (modifiables depuis /admin/settings)

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

/** Valeur vide ou null : le réglage est supprimé */
export async function setSetting(key: string, value: string | null) {
  const clean = value?.trim();
  if (!clean) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  await prisma.setting.upsert({ where: { key }, create: { key, value: clean }, update: { value: clean } });
}

export type RegistrationMode = "open" | "invite" | "closed";

/**
 * Qui peut s'inscrire. Le réglage de l'espace admin l'emporte ; sans lui, la variable INVITE_CODE (si elle existe)
 * demande un code, sinon l'inscription est ouverte.
 */
export async function registrationPolicy(): Promise<{ mode: RegistrationMode; code: string }> {
  const [mode, code] = await Promise.all([getSetting("registration_mode"), getSetting("invite_code")]);
  const envCode = process.env.INVITE_CODE?.trim() ?? "";
  if (mode === "open" || mode === "closed") return { mode, code: "" };
  if (mode === "invite") return { mode: code || envCode ? "invite" : "closed", code: code ?? envCode };
  return envCode ? { mode: "invite", code: envCode } : { mode: "open", code: "" };
}
