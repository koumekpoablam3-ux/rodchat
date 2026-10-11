import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { visibleMessagesWhere } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { searchHitSelect, toSearchHit } from "@/lib/search-hit";
import { getSessionUserId } from "@/lib/session";

const MAX_STARRED = 300;

// Mes favoris : le plus récemment ajouté d'abord. ?ids=1 ne renvoie que les identifiants (pour afficher les étoiles).
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const idsOnly = new URL(req.url).searchParams.get("ids") === "1";

  const rows = await prisma.starredMessage.findMany({
    where: {
      userId,
      message: {
        AND: [
          { deletedAt: null },
          visibleMessagesWhere(userId),
          // Un groupe quitté ne laisse pas ses messages accessibles
          { conversation: { participants: { some: { userId } } } },
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_STARRED,
    select: idsOnly ? { messageId: true } : { message: { select: searchHitSelect } },
  });

  if (idsOnly) {
    return NextResponse.json({ ids: (rows as { messageId: string }[]).map((r) => r.messageId) });
  }
  const hits = (rows as { message: Parameters<typeof toSearchHit>[0] }[]).map((r) => toSearchHit(r.message, userId));
  return NextResponse.json({ hits });
}
