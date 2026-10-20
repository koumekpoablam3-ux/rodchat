import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { toE164 } from "@/lib/phone";
import { clearPhoneVerification } from "@/lib/phone-verify";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";
import { smsAvailable } from "@/lib/sms";

export const dynamic = "force-dynamic";

// Mon numéro : lecture, changement, et réglage « me retrouver par mon numéro »
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, verifiedPhone: true, phoneDiscoverable: true },
  });
  return NextResponse.json(
    {
      phone: user?.phone ?? null,
      verified: Boolean(user?.verifiedPhone && user.verifiedPhone === user.phone),
      discoverable: user?.phoneDiscoverable ?? true,
      smsAvailable: smsAvailable(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const putSchema = z.object({
  dial: z.string().regex(/^\d{1,4}$/, "Choisis le pays de ton numéro."),
  national: z.string().trim().min(4, "Indique ton numéro de téléphone.").max(25, "Ce numéro est trop long."),
});

// Ajouter ou changer mon numéro : il redevient « non vérifié »
export async function PUT(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`phone-change:${userId}`, 5, 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Trop de changements. Réessaie plus tard." }, { status: 429 });
  }
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const phone = toE164(parsed.data.national, parsed.data.dial);
  if (!phone) return badRequest("Ce numéro de téléphone n'est pas valide. Vérifie le pays et le numéro.");

  await prisma.user.update({ where: { id: userId }, data: { phone } });
  await clearPhoneVerification(userId);
  await prisma.phoneVerification.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true, phone });
}

const patchSchema = z.object({ discoverable: z.boolean() });

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Requête invalide.");
  await prisma.user.update({ where: { id: userId }, data: { phoneDiscoverable: parsed.data.discoverable } });
  return NextResponse.json({ ok: true });
}
