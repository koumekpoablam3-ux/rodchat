import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Les personnes que j'ai bloquées, les plus récentes d'abord (pour pouvoir les débloquer depuis les paramètres) */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const blocks = await prisma.block.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  return NextResponse.json({ users: blocks.map((block) => block.blocked) });
}
