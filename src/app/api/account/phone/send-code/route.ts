import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { badRequest, unauthorized } from "@/lib/api";
import { hashCode } from "@/lib/phone-server";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";
import { sendSms, smsAvailable } from "@/lib/sms";

export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000;

// Recevoir un code de vérification par SMS sur mon numéro
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!smsAvailable()) {
    return badRequest("La vérification par SMS n'est pas activée. Demande à l'administrateur de vérifier ton numéro.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, verifiedPhone: true } });
  if (!user?.phone) return badRequest("Ajoute d'abord ton numéro de téléphone.");
  if (user.verifiedPhone === user.phone) return badRequest("Ton numéro est déjà vérifié.");

  // Limites : par compte, et par numéro (on ne doit pas pouvoir inonder de SMS le numéro de quelqu'un d'autre)
  const byUser = await rateLimitShared(`sms:${userId}`, 3, 60 * 60 * 1000);
  const byPhone = await rateLimitShared(`sms-phone:${user.phone}`, 5, 24 * 60 * 60 * 1000);
  if (!byUser.ok || !byPhone.ok) {
    return NextResponse.json({ error: "Trop de codes demandés. Réessaie plus tard." }, { status: 429 });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.phoneVerification.deleteMany({ where: { userId } });
  const record = await prisma.phoneVerification.create({
    data: { userId, phone: user.phone, codeHash: hashCode(code, user.phone), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    select: { id: true },
  });

  const sent = await sendSms(user.phone, `Rodchat : ton code de vérification est ${code}. Il est valable 10 minutes. Ne le partage avec personne.`);
  if (!sent) {
    await prisma.phoneVerification.delete({ where: { id: record.id } });
    return NextResponse.json({ error: "Le SMS n'a pas pu être envoyé. Vérifie ton numéro, puis réessaie." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
