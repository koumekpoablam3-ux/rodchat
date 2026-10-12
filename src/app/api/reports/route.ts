import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { REPORT_REASON_IDS } from "@/lib/report-reasons";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    messageId: z.string().max(40).optional(),
    userId: z.string().max(40).optional(),
    reason: z.enum(REPORT_REASON_IDS),
    details: z.string().trim().max(500, "Les précisions sont trop longues (500 caractères maximum).").optional(),
  })
  .refine((value) => value.messageId || value.userId, "Indique ce que tu signales.");

// Signaler un message ou une personne. Le signalement est lu par les administrateurs ; la personne signalée n'en est pas informée.
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`report:${userId}`, 10, 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Tu as envoyé beaucoup de signalements. Réessaie plus tard." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const { messageId, reason, details } = parsed.data;

  let targetUserId = parsed.data.userId;
  let conversationId: string | undefined;
  let excerpt: string | undefined;

  if (messageId) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, conversationId: true, type: true, content: true },
    });
    if (!message) return notFound("Ce message n'existe plus.");
    // On ne signale que ce qu'on peut voir : il faut être membre de la discussion
    const member = await prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId: message.conversationId } },
      select: { id: true },
    });
    if (!member) return notFound("Ce message n'existe plus.");
    if (message.senderId === userId) return badRequest("Tu ne peux pas signaler ton propre message.");
    targetUserId = message.senderId;
    conversationId = message.conversationId;
    // Extrait conservé : le signalement reste exploitable même si le message est supprimé ensuite
    excerpt = message.type === "TEXT" ? (message.content ?? "").slice(0, 300) : `[${message.type}]`;
  }

  if (targetUserId === userId) return badRequest("Tu ne peux pas te signaler toi-même.");
  const target = targetUserId
    ? await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, displayName: true, username: true } })
    : null;
  if (!target) return notFound("Cette personne n'existe plus.");

  await prisma.report.create({
    data: {
      reporterId: userId,
      targetUserId: target.id,
      targetName: `${target.displayName} (@${target.username})`,
      messageId,
      conversationId,
      reason,
      details: details || null,
      messageExcerpt: excerpt ?? null,
    },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
