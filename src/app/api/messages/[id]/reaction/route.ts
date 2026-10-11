import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { REACTION_EMOJIS } from "@/lib/limits";
import { broadcastMessageUpdate, loadMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

const schema = z.object({ emoji: z.string().nullable() });

// Réagir à un message. Un emoji identique à ma réaction actuelle, ou null, la retire.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!rateLimit(`react:${userId}`, 60, 60_000).ok) {
    return NextResponse.json({ error: "Doucement, tu réagis trop vite." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Réaction invalide.");
  const { emoji } = parsed.data;
  if (emoji !== null && !REACTION_EMOJIS.includes(emoji)) return badRequest("Cette réaction n'est pas disponible.");

  const message = await prisma.message.findUnique({
    where: { id: params.id },
    select: { id: true, conversationId: true, type: true, deletedAt: true, createdAt: true },
  });
  if (!message) return notFound("Ce message n'existe plus.");

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: message.conversationId } },
    select: { joinedAt: true },
  });
  if (!member || message.createdAt < member.joinedAt) return forbidden();
  if (message.deletedAt) return badRequest("Ce message a été supprimé.");
  if (message.type === "SYSTEM" || message.type === "CALL") return badRequest("On ne réagit pas à ce type de message.");

  const current = await prisma.reaction.findUnique({
    where: { messageId_userId: { messageId: message.id, userId } },
    select: { emoji: true },
  });

  if (emoji === null || current?.emoji === emoji) {
    if (current) await prisma.reaction.delete({ where: { messageId_userId: { messageId: message.id, userId } } });
  } else {
    await prisma.reaction.upsert({
      where: { messageId_userId: { messageId: message.id, userId } },
      create: { messageId: message.id, userId, emoji },
      update: { emoji },
    });
  }

  const updated = await loadMessage(message.id);
  if (!updated) return notFound("Ce message n'existe plus.");
  await broadcastMessageUpdate(updated);
  return NextResponse.json({ message: updated });
}
