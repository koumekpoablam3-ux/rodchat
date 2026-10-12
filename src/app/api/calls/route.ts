import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import type { CallRecord } from "@/types/calls";

export const dynamic = "force-dynamic";

// Historique de mes appels terminés : ceux que j'ai passés ou reçus, et les appels de groupe de mes discussions
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const calls = await prisma.call.findMany({
    where: {
      status: { in: ["ENDED", "MISSED", "DECLINED"] },
      OR: [
        { callerId: userId },
        { calleeId: userId },
        { calleeId: null, conversation: { participants: { some: { userId } } } },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: 60,
    select: {
      id: true,
      conversationId: true,
      kind: true,
      status: true,
      startedAt: true,
      durationSec: true,
      callerId: true,
      calleeId: true,
    },
  });

  const records: CallRecord[] = calls.map((call) => ({
    id: call.id,
    conversationId: call.conversationId,
    kind: call.kind,
    status: call.status as CallRecord["status"],
    startedAt: call.startedAt.toISOString(),
    durationSec: call.durationSec,
    callerId: call.callerId,
    calleeId: call.calleeId,
  }));
  return NextResponse.json({ calls: records }, { headers: { "Cache-Control": "no-store" } });
}
