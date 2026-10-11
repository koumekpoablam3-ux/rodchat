import { NextResponse } from "next/server";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { displayNameOf, getMembership } from "@/lib/access";
import { deleteAvatarByUrl, readAvatarUpload, saveAvatar } from "@/lib/avatars";
import { broadcastConversation, getConversationSummary, postSystemMessage } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

async function requireGroupAdmin(userId: string, conversationId: string) {
  const member = await getMembership(userId, conversationId);
  if (!member) return forbidden();
  if (!member.conversation.isGroup) return badRequest("Seuls les groupes ont une photo.");
  if (member.role !== "ADMIN") return forbidden();
  return null;
}

// Photo du groupe : le corps de la requête est l'image brute (déjà réduite par le navigateur)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const denied = await requireGroupAdmin(userId, params.id);
  if (denied) return denied;

  if (!rateLimit(`avatar:${userId}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Patiente un peu avant de changer à nouveau la photo." }, { status: 429 });
  }

  const upload = await readAvatarUpload(req);
  if (!upload.ok) return badRequest(upload.error);

  const previous = await prisma.conversation.findUnique({ where: { id: params.id }, select: { avatarUrl: true } });
  const url = await saveAvatar(upload);
  await prisma.conversation.update({ where: { id: params.id }, data: { avatarUrl: url } });
  await deleteAvatarByUrl(previous?.avatarUrl ?? null);

  await postSystemMessage(params.id, userId, `${await displayNameOf(userId)} a modifié l'image du groupe`);
  await broadcastConversation(params.id);

  return NextResponse.json({ conversation: await getConversationSummary(params.id, userId) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const denied = await requireGroupAdmin(userId, params.id);
  if (denied) return denied;

  const previous = await prisma.conversation.findUnique({ where: { id: params.id }, select: { avatarUrl: true } });
  await prisma.conversation.update({ where: { id: params.id }, data: { avatarUrl: null } });
  await deleteAvatarByUrl(previous?.avatarUrl ?? null);

  await postSystemMessage(params.id, userId, `${await displayNameOf(userId)} a supprimé l'image du groupe`);
  await broadcastConversation(params.id);

  return NextResponse.json({ conversation: await getConversationSummary(params.id, userId) });
}
