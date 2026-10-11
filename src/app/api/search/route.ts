import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { unauthorized } from "@/lib/api";
import { visibleMessagesWhere } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { searchHitSelect, toSearchHit } from "@/lib/search-hit";
import { getSessionUserId } from "@/lib/session";

const MAX_RESULTS = 30;

// Recherche dans les messages (texte et noms de fichiers) de toutes mes discussions,
// ou d'une seule avec ?conversationId=. Le plus récent d'abord.
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const conversationId = params.get("conversationId");
  if (q.length < 2) return NextResponse.json({ hits: [] });

  if (!rateLimit(`search:${userId}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Trop de recherches. Patiente un instant." }, { status: 429 });
  }

  const memberships = await prisma.participant.findMany({
    where: { userId, ...(conversationId ? { conversationId } : {}) },
    select: { conversationId: true, joinedAt: true },
  });
  if (memberships.length === 0) return NextResponse.json({ hits: [] });

  // Dans chaque discussion, seulement ce qui a été posté depuis mon arrivée
  const scope: Prisma.MessageWhereInput = {
    OR: memberships.map((m) => ({ conversationId: m.conversationId, createdAt: { gte: m.joinedAt } })),
  };

  const rows = await prisma.message.findMany({
    where: {
      AND: [
        scope,
        visibleMessagesWhere(userId),
        { deletedAt: null, type: { notIn: ["SYSTEM", "CALL"] } },
        {
          OR: [
            { content: { contains: q, mode: "insensitive" } },
            { attachment: { fileName: { contains: q, mode: "insensitive" } } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: MAX_RESULTS,
    select: searchHitSelect,
  });

  const hits = rows.map((row) => toSearchHit(row, userId));

  return NextResponse.json({ hits });
}
