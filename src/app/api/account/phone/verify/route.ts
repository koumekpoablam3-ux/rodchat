import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { markPhoneVerified } from "@/lib/phone-verify";
import { hashCode } from "@/lib/phone-server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const schema = z.object({ code: z.string().regex(/^\d{6}$/, "Le code a 6 chiffres.") });

// Valider le code reçu par SMS
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  const record = user?.phone
    ? await prisma.phoneVerification.findFirst({
        where: { userId, phone: user.phone, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      })
    : null;
  if (!user?.phone || !record) return badRequest("Ce code a expiré. Demande-en un nouveau.");
  if (record.attempts >= MAX_ATTEMPTS) return badRequest("Trop d'essais. Demande un nouveau code.");

  if (hashCode(parsed.data.code, user.phone) !== record.codeHash) {
    await prisma.phoneVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return badRequest("Code incorrect.");
  }

  const result = await markPhoneVerified(userId, user.phone);
  if (result === "taken") {
    return NextResponse.json({ error: "Ce numéro est déjà vérifié sur un autre compte." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
