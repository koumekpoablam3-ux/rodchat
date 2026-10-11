import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { displayNameOf, getMembership } from "@/lib/access";
import {
  broadcastConversation,
  getConversationSummary,
  joinNames,
  postSystemMessage,
  syncConversationRooms,
} from "@/lib/conversations";
import { MAX_GROUP_MEMBERS } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const schema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Choisis au moins une personne.").max(MAX_GROUP_MEMBERS),
});

// Ajouter des personnes à un groupe (administrateurs seulement)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const member = await getMembership(userId, params.id);
  if (!member) return forbidden();
  if (!member.conversation.isGroup) return badRequest("On n'ajoute personne à une discussion à deux.");
  if (member.role !== "ADMIN") return forbidden();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const existing = await prisma.participant.findMany({
    where: { conversationId: params.id },
    select: { userId: true },
  });
  const present = new Set(existing.map((p) => p.userId));
  const wanted = Array.from(new Set(parsed.data.userIds)).filter((id) => !present.has(id));
  if (wanted.length === 0) return badRequest("Ces personnes font déjà partie du groupe.");
  if (existing.length + wanted.length > MAX_GROUP_MEMBERS) {
    return badRequest(`Un groupe peut contenir ${MAX_GROUP_MEMBERS} personnes au maximum.`);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, displayName: true },
  });
  if (users.length !== wanted.length) return badRequest("Une des personnes n'existe plus.");

  await prisma.participant.createMany({
    data: users.map((u) => ({ userId: u.id, conversationId: params.id })),
    skipDuplicates: true,
  });

  await syncConversationRooms(params.id);
  const actor = await displayNameOf(userId);
  await postSystemMessage(params.id, userId, `${actor} a ajouté ${joinNames(users.map((u) => u.displayName))}`);
  await broadcastConversation(params.id);

  const conversation = await getConversationSummary(params.id, userId);
  return NextResponse.json({ conversation });
}
