import { NextResponse } from "next/server";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { emitSummaryTo, getConversationSummary } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

async function directConversationId(me: string, other: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { directKey: [me, other].sort().join(":") },
    select: { id: true },
  });
  return conversation?.id ?? null;
}

async function change(userId: string, targetId: string, blocked: boolean) {
  if (targetId === userId) return badRequest("Tu ne peux pas te bloquer toi-même.");
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) return notFound("Cet utilisateur n'existe pas.");

  if (blocked) {
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    });
  } else {
    await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
  }

  // Mes autres appareils voient le changement ; la réponse met à jour celui-ci tout de suite
  const conversationId = await directConversationId(userId, targetId);
  const conversation = conversationId ? await getConversationSummary(conversationId, userId) : null;
  if (conversationId) await emitSummaryTo(userId, conversationId);
  return NextResponse.json({ ok: true, blocked, conversation });
}

// Bloquer
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  return change(userId, params.id, true);
}

// Débloquer
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  return change(userId, params.id, false);
}
