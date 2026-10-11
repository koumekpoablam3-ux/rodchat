import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Abonnement aux notifications invalide.");
  const { endpoint, keys } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return badRequest("Abonnement introuvable.");

  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId } });
  return NextResponse.json({ ok: true });
}
