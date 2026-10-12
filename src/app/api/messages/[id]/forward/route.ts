import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { MAX_FORWARD_TARGETS } from "@/lib/limits";
import { postMessage, type AttachmentInput } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { BlockedError } from "@/lib/blocks";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

const FORWARDABLE_TYPES = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE"];

const schema = z.object({
  conversationIds: z
    .array(z.string().min(1))
    .min(1, "Choisis au moins une discussion.")
    .max(MAX_FORWARD_TARGETS, `Tu peux transférer vers ${MAX_FORWARD_TARGETS} discussions au maximum.`),
});

// Transférer un message vers d'autres discussions (le fichier est copié)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`forward:${userId}`, 30, 10 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Tu transfères beaucoup de messages. Patiente un peu." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const targetIds = Array.from(new Set(parsed.data.conversationIds));

  const source = await prisma.message.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      conversationId: true,
      type: true,
      content: true,
      deletedAt: true,
      createdAt: true,
      attachment: {
        select: { fileName: true, mimeType: true, size: true, durationMs: true, width: true, height: true, data: true },
      },
    },
  });
  if (!source) return notFound("Ce message n'existe plus.");

  const sourceMember = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: source.conversationId } },
    select: { joinedAt: true },
  });
  if (!sourceMember || source.createdAt < sourceMember.joinedAt) return forbidden();
  if (source.deletedAt) return badRequest("Ce message a été supprimé.");
  if (!FORWARDABLE_TYPES.includes(source.type)) return badRequest("Ce message ne peut pas être transféré.");

  // Seulement vers des discussions dont je fais partie
  const memberships = await prisma.participant.findMany({
    where: { userId, conversationId: { in: targetIds } },
    select: { conversationId: true },
  });
  if (memberships.length === 0) return forbidden();

  const attachment: AttachmentInput | undefined = source.attachment
    ? {
        fileName: source.attachment.fileName,
        mimeType: source.attachment.mimeType,
        size: source.attachment.size,
        durationMs: source.attachment.durationMs,
        width: source.attachment.width,
        height: source.attachment.height,
        data: new Uint8Array(source.attachment.data),
      }
    : undefined;

  let sent = 0;
  let blocked = 0;
  for (const { conversationId } of memberships) {
    try {
      await postMessage({
        senderId: userId,
        conversationId,
        type: source.type,
        content: source.content,
        attachment,
        forwarded: true,
      });
      sent += 1;
    } catch (error) {
      if (!(error instanceof BlockedError)) throw error;
      blocked += 1;
    }
  }
  if (sent === 0 && blocked > 0) {
    return NextResponse.json({ error: "Tu ne peux pas écrire à cette personne." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, count: sent });
}
