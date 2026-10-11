import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { getMembership } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

async function requireGroupAdmin(userId: string, conversationId: string) {
  const member = await getMembership(userId, conversationId);
  if (!member) return forbidden();
  if (!member.conversation.isGroup) return badRequest("Seuls les groupes ont un lien d'invitation.");
  if (member.role !== "ADMIN") return forbidden();
  return null;
}

// Lien d'invitation du groupe : réservé aux administrateurs
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const denied = await requireGroupAdmin(userId, params.id);
  if (denied) return denied;

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { inviteToken: true },
  });
  return NextResponse.json({ token: conversation?.inviteToken ?? null });
}

// Crée le lien, ou le remplace par un nouveau (l'ancien cesse de fonctionner)
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const denied = await requireGroupAdmin(userId, params.id);
  if (denied) return denied;

  const token = randomBytes(24).toString("base64url");
  await prisma.conversation.update({ where: { id: params.id }, data: { inviteToken: token } });
  return NextResponse.json({ token });
}

// Révoque le lien : plus personne ne peut rejoindre avec
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const denied = await requireGroupAdmin(userId, params.id);
  if (denied) return denied;

  await prisma.conversation.update({ where: { id: params.id }, data: { inviteToken: null } });
  return NextResponse.json({ token: null });
}
