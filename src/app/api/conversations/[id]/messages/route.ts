import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { forbidden, notFound, unauthorized } from "@/lib/api";
import { messageInclude, visibleMessagesWhere } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const PAGE_SIZE = 40;
const AROUND_SIZE = 25;

// Messages d'une conversation : les plus récents d'abord, puis ?before=<id> pour remonter,
// ou ?around=<id> pour charger une fenêtre autour d'un message (résultat de recherche, citation).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const conversationId = params.id;
  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    select: { joinedAt: true },
  });
  if (!member) return forbidden();

  const search = new URL(req.url).searchParams;
  const before = search.get("before");
  const around = search.get("around");

  // Dans un groupe, on ne voit que les messages postés depuis son arrivée
  const base: Prisma.MessageWhereInput = {
    AND: [{ conversationId }, visibleMessagesWhere(userId, member.joinedAt)],
  };

  if (around) {
    const target = await prisma.message.findFirst({
      where: { AND: [base, { id: around }] },
      select: { id: true, createdAt: true },
    });
    if (!target) return notFound("Ce message n'existe plus.");

    const olderWhere: Prisma.MessageWhereInput = {
      AND: [
        base,
        {
          OR: [
            { createdAt: { lt: target.createdAt } },
            { createdAt: target.createdAt, id: { lt: target.id } },
          ],
        },
      ],
    };
    const newerWhere: Prisma.MessageWhereInput = {
      AND: [
        base,
        {
          OR: [
            { createdAt: { gt: target.createdAt } },
            { createdAt: target.createdAt, id: { gt: target.id } },
          ],
        },
      ],
    };

    const [older, current, newer] = await Promise.all([
      prisma.message.findMany({
        where: olderWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: AROUND_SIZE + 1,
        include: messageInclude,
      }),
      prisma.message.findUnique({ where: { id: target.id }, include: messageInclude }),
      prisma.message.findMany({
        where: newerWhere,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: AROUND_SIZE + 1,
        include: messageInclude,
      }),
    ]);
    if (!current) return notFound("Ce message n'existe plus.");

    const hasMore = older.length > AROUND_SIZE;
    const hasNewer = newer.length > AROUND_SIZE;
    const messages = [
      ...older.slice(0, AROUND_SIZE).reverse(),
      current,
      ...newer.slice(0, AROUND_SIZE),
    ];
    return NextResponse.json({ messages, hasMore, hasNewer });
  }

  const rows = await prisma.message.findMany({
    where: base,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    include: messageInclude,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const messages = rows.slice(0, PAGE_SIZE).reverse();

  return NextResponse.json({ messages, hasMore, hasNewer: false });
}
