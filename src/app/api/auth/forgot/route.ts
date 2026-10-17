import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { isAdminUsername } from "@/lib/admin";
import { badRequest, clientIp } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Indique ton nom d'utilisateur.").max(40),
  newPassword: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères.")
    .max(72, "Le mot de passe est trop long (72 caractères maximum)."),
  proof: z
    .string()
    .trim()
    .min(5, "Explique à l'administrateur comment t'identifier (au moins quelques mots).")
    .max(300, "C'est trop long (300 caractères maximum)."),
});

// Mot de passe oublié : la personne choisit un nouveau mot de passe ; il ne s'applique que quand l'administrateur approuve.
// La réponse est toujours la même, que le compte existe ou non : on ne révèle pas quels noms d'utilisateur existent.
export async function POST(req: Request) {
  const byIp = await rateLimitShared(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!byIp.ok) {
    return NextResponse.json({ error: "Trop de demandes. Réessaie plus tard." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const { username, newPassword, proof } = parsed.data;

  if (!(await rateLimitShared(`forgot-user:${username}`, 5, 24 * 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Trop de demandes pour ce compte. Réessaie demain." }, { status: 429 });
  }

  // Calculé dans tous les cas : le temps de réponse ne dit pas si le compte existe
  const newPasswordHash = await hash(newPassword, 10);

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } });
  // Les administrateurs n'utilisent pas ce circuit (voir le README) ; au plus 3 demandes en attente par compte
  if (user && !isAdminUsername(user.username)) {
    const pending = await prisma.passwordResetRequest.count({ where: { userId: user.id, status: "PENDING" } });
    if (pending < 3) {
      await prisma.passwordResetRequest.create({ data: { userId: user.id, newPasswordHash, proof } });
    }
  }

  return NextResponse.json({ ok: true });
}
