import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { forgetSessionVersion, getSessionUserId, startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1, "Indique ton mot de passe actuel.").max(72),
  newPassword: z
    .string()
    .min(8, "Le nouveau mot de passe doit faire au moins 8 caractères.")
    .max(72, "Le mot de passe est trop long (72 caractères maximum)."),
});

// Changer mon mot de passe : les autres appareils sont déconnectés, celui-ci reste connecté
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`password:${userId}`, 5, 15 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Trop d'essais. Réessaie dans quelques minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await compare(parsed.data.currentPassword, user.passwordHash))) {
    return badRequest("Le mot de passe actuel est incorrect.");
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return badRequest("Choisis un mot de passe différent de l'ancien.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(parsed.data.newPassword, 10), sessionVersion: { increment: 1 } },
  });
  forgetSessionVersion(userId);
  await startSession(userId);
  return NextResponse.json({ ok: true });
}
