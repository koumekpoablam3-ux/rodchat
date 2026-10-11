import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getRealtime } from "@/lib/realtime";
import { getSessionUserId } from "@/lib/session";

const schema = z.object({ starred: z.boolean() });

// Ajouter un message à mes favoris, ou l'en retirer
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Requête invalide.");
  const { starred } = parsed.data;

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

  if (starred) {
    if (message.deletedAt) return badRequest("Ce message a été supprimé.");
    if (message.type === "SYSTEM" || message.type === "CALL") return badRequest("Ce type de message ne peut pas être mis en favori.");
    await prisma.starredMessage.upsert({
      where: { userId_messageId: { userId, messageId: message.id } },
      create: { userId, messageId: message.id },
      update: {},
    });
  } else {
    await prisma.starredMessage.deleteMany({ where: { userId, messageId: message.id } });
  }

  // Mes autres appareils se mettent à jour
  await getRealtime()?.emit(`user:${userId}`, "star:updated", { messageId: message.id, starred });
  return NextResponse.json({ starred });
}
