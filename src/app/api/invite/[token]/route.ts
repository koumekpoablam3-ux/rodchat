import { NextResponse } from "next/server";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { displayNameOf } from "@/lib/access";
import {
  broadcastConversation,
  postSystemMessage,
  syncConversationRooms,
} from "@/lib/conversations";
import { MAX_GROUP_MEMBERS } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

const INVALID = "Ce lien d'invitation n'est plus valide.";

function findByToken(token: string) {
  // Un jeton vide ou absurde ne doit jamais correspondre à une discussion sans lien
  if (token.length < 16 || token.length > 100) return null;
  return prisma.conversation.findFirst({
    where: { inviteToken: token, isGroup: true },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      description: true,
      participants: { select: { userId: true } },
    },
  });
}

// Aperçu du groupe derrière un lien
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const group = await findByToken(params.token);
  if (!group) return notFound(INVALID);

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name ?? "Groupe",
      avatarUrl: group.avatarUrl,
      description: group.description,
      memberCount: group.participants.length,
      alreadyMember: group.participants.some((p) => p.userId === userId),
    },
  });
}

// Rejoindre le groupe avec le lien
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!rateLimit(`invite-join:${userId}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Trop de tentatives. Patiente un peu." }, { status: 429 });
  }

  const group = await findByToken(params.token);
  if (!group) return notFound(INVALID);

  if (group.participants.some((p) => p.userId === userId)) {
    return NextResponse.json({ conversationId: group.id });
  }
  if (group.participants.length >= MAX_GROUP_MEMBERS) {
    return badRequest(`Ce groupe est complet (${MAX_GROUP_MEMBERS} personnes).`);
  }

  await prisma.participant.createMany({
    data: [{ userId, conversationId: group.id }],
    skipDuplicates: true,
  });

  await syncConversationRooms(group.id);
  await postSystemMessage(group.id, userId, `${await displayNameOf(userId)} a rejoint le groupe avec le lien d'invitation`);
  await broadcastConversation(group.id);

  return NextResponse.json({ conversationId: group.id });
}
