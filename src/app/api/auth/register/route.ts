import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { clientIp } from "@/lib/api";
import { inviteMatches } from "@/lib/invite";
import { toE164 } from "@/lib/phone";
import { registrationPolicy } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { startSession } from "@/lib/session";
import { generateUsername } from "@/lib/username";
import { serializeUser, userSelect } from "@/lib/users";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Indique le nom que les autres verront.")
    .max(40, "Ton nom est trop long (40 caractères maximum)."),
  // Pays (indicatif, ex. « 225 ») et numéro tel qu'on le tape
  dial: z.string().regex(/^\d{1,4}$/, "Choisis le pays de ton numéro."),
  national: z.string().trim().min(4, "Indique ton numéro de téléphone.").max(25, "Ce numéro est trop long."),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères.")
    .max(72, "Le mot de passe est trop long (72 caractères maximum)."),
  inviteCode: z.string().max(100).optional(),
});

// Inscription avec un numéro de téléphone. Le numéro est enregistré « non vérifié » : il devient « vérifié » par SMS
// (si un service d'envoi est configuré) ou par l'administrateur. Plusieurs comptes peuvent annoncer le même numéro
// tant qu'aucun n'est vérifié : on ne révèle donc jamais qu'un numéro est déjà utilisé.
export async function POST(req: Request) {
  const limit = await rateLimitShared(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Trop de tentatives. Réessaie dans ${Math.ceil(limit.retryAfter / 60)} min.` },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { displayName, dial, national, password, inviteCode } = parsed.data;

  const phone = toE164(national, dial);
  if (!phone) {
    return NextResponse.json({ error: "Ce numéro de téléphone n'est pas valide. Vérifie le pays et le numéro." }, { status: 400 });
  }

  // Inscriptions fermées, ou sur invitation : vérifié avant tout le reste
  const policy = await registrationPolicy();
  if (policy.mode === "closed") {
    return NextResponse.json({ error: "Les inscriptions sont fermées pour le moment." }, { status: 403 });
  }
  if (policy.mode === "invite" && !inviteMatches(policy.code, inviteCode)) {
    return NextResponse.json({ error: "Code d'invitation incorrect." }, { status: 403 });
  }

  const passwordHash = await hash(password, 10);
  // L'identifiant est généré ; en cas de collision rarissime (course entre deux inscriptions), on réessaie
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const user = await prisma.user.create({
        data: { username: await generateUsername(displayName), displayName, passwordHash, phone },
        select: userSelect,
      });
      await startSession(user.id);
      return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  return NextResponse.json({ error: "Inscription impossible pour le moment. Réessaie." }, { status: 500 });
}
