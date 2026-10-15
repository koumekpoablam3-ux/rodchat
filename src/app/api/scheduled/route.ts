import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { assertCanMessage, BlockedError, blockedMessage } from "@/lib/blocks";
import { MAX_MESSAGE_LENGTH } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { MAX_SCHEDULED_PER_USER, MAX_SCHEDULE_AHEAD_MS, MIN_SCHEDULE_AHEAD_MS } from "@/lib/scheduled";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  conversationId: z.string().min(1).max(40),
  content: z.string().trim().min(1, "Écris un message.").max(MAX_MESSAGE_LENGTH, "Ce message est trop long."),
  sendAt: z.string().datetime({ message: "Date invalide." }),
});

// Mes messages programmés (en attente), du plus proche au plus lointain
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const conversationId = new URL(req.url).searchParams.get("conversationId") ?? undefined;
  const items = await prisma.scheduledMessage.findMany({
    where: { senderId: userId, ...(conversationId ? { conversationId } : {}) },
    orderBy: { sendAt: "asc" },
    select: { id: true, conversationId: true, content: true, sendAt: true },
  });
  return NextResponse.json(
    { items: items.map((item) => ({ ...item, sendAt: item.sendAt.toISOString() })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Programmer un message texte
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`schedule:${userId}`, 60, 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Trop de messages programmés. Réessaie plus tard." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const { conversationId, content } = parsed.data;
  const sendAt = new Date(parsed.data.sendAt);

  const ahead = sendAt.getTime() - Date.now();
  if (ahead < MIN_SCHEDULE_AHEAD_MS) return badRequest("Choisis une heure dans le futur.");
  if (ahead > MAX_SCHEDULE_AHEAD_MS) return badRequest("Tu peux programmer un message jusqu'à 30 jours à l'avance.");

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    select: { id: true },
  });
  if (!member) return forbidden();

  try {
    await assertCanMessage(userId, conversationId);
  } catch (error) {
    if (error instanceof BlockedError) {
      return NextResponse.json({ error: error.userMessage }, { status: 403 });
    }
    throw error;
  }

  if ((await prisma.scheduledMessage.count({ where: { senderId: userId } })) >= MAX_SCHEDULED_PER_USER) {
    return badRequest(`Tu as déjà ${MAX_SCHEDULED_PER_USER} messages programmés. Annule-en un pour en ajouter.`);
  }

  const item = await prisma.scheduledMessage.create({
    data: { senderId: userId, conversationId, content, sendAt },
    select: { id: true, conversationId: true, content: true, sendAt: true },
  });
  return NextResponse.json({ item: { ...item, sendAt: item.sendAt.toISOString() } }, { status: 201 });
}
