import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { visibleMessagesWhere } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const PAGE_SIZE = 30;
const TYPES = ["IMAGE", "VIDEO", "AUDIO", "FILE"] as const;
type MediaType = (typeof TYPES)[number];

// Galerie d'une discussion : ?type=IMAGE|VIDEO|AUDIO|FILE, le plus récent d'abord, ?before=<id> pour la suite
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: params.id } },
    select: { joinedAt: true },
  });
  if (!member) return forbidden();

  const search = new URL(req.url).searchParams;
  const type = search.get("type") as MediaType | null;
  const before = search.get("before");
  if (!type || !TYPES.includes(type)) return badRequest("Type de média invalide.");

  const where: Prisma.MessageWhereInput = {
    AND: [{ conversationId: params.id, type, deletedAt: null }, visibleMessagesWhere(userId, member.joinedAt)],
  };

  const rows = await prisma.message.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: {
      id: true,
      senderId: true,
      createdAt: true,
      sender: { select: { displayName: true } },
      attachment: {
        select: { id: true, fileName: true, mimeType: true, size: true, durationMs: true, width: true, height: true, purgedAt: true },
      },
    },
  });

  const items = rows
    .slice(0, PAGE_SIZE)
    .filter((row) => row.attachment !== null && row.attachment.purgedAt === null)
    .map((row) => ({
      messageId: row.id,
      senderId: row.senderId,
      senderName: row.sender.displayName,
      createdAt: row.createdAt.toISOString(),
      attachment: row.attachment,
    }));

  return NextResponse.json({ items, hasMore: rows.length > PAGE_SIZE, lastId: rows.slice(0, PAGE_SIZE).at(-1)?.id ?? null });
}
