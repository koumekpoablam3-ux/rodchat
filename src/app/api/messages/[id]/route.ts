import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { DELETE_FOR_ALL_WINDOW_MS, EDIT_WINDOW_MS, MAX_MESSAGE_LENGTH } from "@/lib/limits";
import { broadcastMessageUpdate, loadMessage, scheduleLinkPreview } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { getRealtime } from "@/lib/realtime";
import { getSessionUserId } from "@/lib/session";

const DELETABLE_TYPES = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE"];

async function findForMember(messageId: string, userId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, type: true, createdAt: true, deletedAt: true },
  });
  if (!message) return { error: notFound("Ce message n'existe plus.") } as const;

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: message.conversationId } },
    select: { joinedAt: true },
  });
  if (!member || message.createdAt < member.joinedAt) return { error: forbidden() } as const;
  return { message } as const;
}

const editSchema = z.object({
  content: z.string().trim().min(1, "Le message ne peut pas être vide.").max(MAX_MESSAGE_LENGTH),
});

// Modifier un message texte (le sien, pendant 15 minutes)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const found = await findForMember(params.id, userId);
  if ("error" in found) return found.error;
  const { message } = found;

  if (message.senderId !== userId) return forbidden();
  if (message.type !== "TEXT") return badRequest("Seuls les messages texte peuvent être modifiés.");
  if (message.deletedAt) return badRequest("Ce message a été supprimé.");
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    return badRequest("Tu ne peux plus modifier ce message (15 minutes maximum).");
  }

  const parsed = editSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  await prisma.message.update({
    where: { id: message.id },
    // L'ancien aperçu ne correspond plus : on le retire, puis on cherche celui du nouveau texte
    data: { content: parsed.data.content, editedAt: new Date(), linkPreview: Prisma.DbNull },
  });
  const updated = await loadMessage(message.id);
  if (!updated) return notFound("Ce message n'existe plus.");

  await broadcastMessageUpdate(updated);
  scheduleLinkPreview(updated);
  return NextResponse.json({ message: updated });
}

// Supprimer : ?scope=me (masqué pour moi seulement) ou ?scope=all (supprimé pour tout le monde)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const found = await findForMember(params.id, userId);
  if ("error" in found) return found.error;
  const { message } = found;

  const scope = new URL(req.url).searchParams.get("scope");

  if (scope === "me") {
    await prisma.messageHide.upsert({
      where: { messageId_userId: { messageId: message.id, userId } },
      create: { messageId: message.id, userId },
      update: {},
    });
    // Mes autres appareils le masquent aussi
    await getRealtime()?.emit(`user:${userId}`, "message:hidden", {
      conversationId: message.conversationId,
      messageId: message.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (scope !== "all") return badRequest("Choisis « pour moi » ou « pour tous ».");
  if (message.senderId !== userId) return forbidden();
  if (!DELETABLE_TYPES.includes(message.type)) return badRequest("Ce message ne peut pas être supprimé.");
  if (message.deletedAt) return NextResponse.json({ ok: true });
  if (Date.now() - message.createdAt.getTime() > DELETE_FOR_ALL_WINDOW_MS) {
    return badRequest("Il est trop tard pour supprimer ce message pour tout le monde (48 heures maximum).");
  }

  // Le contenu, le fichier et les réactions disparaissent vraiment ; il ne reste qu'une trace
  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { messageId: message.id } }),
    prisma.reaction.deleteMany({ where: { messageId: message.id } }),
    prisma.starredMessage.deleteMany({ where: { messageId: message.id } }),
    prisma.message.update({
      where: { id: message.id },
      data: { content: null, deletedAt: new Date(), editedAt: null, linkPreview: Prisma.DbNull },
    }),
  ]);
  const updated = await loadMessage(message.id);
  if (!updated) return notFound("Ce message n'existe plus.");

  await broadcastMessageUpdate(updated);
  return NextResponse.json({ message: updated });
}
