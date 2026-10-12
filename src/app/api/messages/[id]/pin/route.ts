import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { broadcastConversation, postSystemMessage } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Nombre maximal de messages épinglés par discussion : au-delà, le plus ancien est désépinglé */
const MAX_PINNED = 3;
const PINNABLE = ["TEXT", "IMAGE", "VIDEO", "AUDIO", "FILE"];

const schema = z.object({ pinned: z.boolean() });

// Épingler un message en haut de la discussion (visible par tous les membres), ou l'en retirer
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Requête invalide.");
  const { pinned } = parsed.data;

  const message = await prisma.message.findUnique({
    where: { id: params.id },
    select: { id: true, conversationId: true, type: true, deletedAt: true, createdAt: true, pinnedAt: true },
  });
  if (!message) return notFound("Ce message n'existe plus.");

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: message.conversationId } },
    select: { joinedAt: true, user: { select: { displayName: true } } },
  });
  if (!member || message.createdAt < member.joinedAt) return forbidden();

  if (pinned) {
    if (message.deletedAt) return badRequest("Ce message a été supprimé.");
    if (!PINNABLE.includes(message.type)) return badRequest("Ce type de message ne peut pas être épinglé.");
    if (message.pinnedAt) return NextResponse.json({ pinned: true });

    // Trop d'épingles : la plus ancienne laisse sa place
    const current = await prisma.message.findMany({
      where: { conversationId: message.conversationId, pinnedAt: { not: null }, deletedAt: null },
      orderBy: { pinnedAt: "asc" },
      select: { id: true },
    });
    const overflow = current.slice(0, Math.max(0, current.length - (MAX_PINNED - 1)));
    if (overflow.length > 0) {
      await prisma.message.updateMany({
        where: { id: { in: overflow.map((m) => m.id) } },
        data: { pinnedAt: null, pinnedById: null },
      });
    }
    await prisma.message.update({ where: { id: message.id }, data: { pinnedAt: new Date(), pinnedById: userId } });
    await postSystemMessage(message.conversationId, userId, `${member.user.displayName} a épinglé un message`);
  } else {
    if (!message.pinnedAt) return NextResponse.json({ pinned: false });
    await prisma.message.update({ where: { id: message.id }, data: { pinnedAt: null, pinnedById: null } });
  }

  // Tous les membres voient la barre se mettre à jour
  await broadcastConversation(message.conversationId);
  return NextResponse.json({ pinned });
}
