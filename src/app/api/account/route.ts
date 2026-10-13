import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { deleteUserAccount } from "@/lib/account";
import { badRequest, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { endSession, getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string().min(1, "Indique ton mot de passe.").max(72) });

// Supprimer définitivement mon compte. Les discussions à deux disparaissent ; mes messages dans les groupes aussi.
export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`delete-account:${userId}`, 5, 15 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Trop d'essais. Réessaie dans quelques minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    return badRequest("Mot de passe incorrect.");
  }

  await deleteUserAccount(userId);
  endSession();
  return NextResponse.json({ ok: true });
}
