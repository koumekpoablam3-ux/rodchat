import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { getMembership } from "@/lib/access";
import { emitSummaryTo, getConversationSummary } from "@/lib/conversations";
import { MAX_PINNED_CONVERSATIONS } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const schema = z.object({
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  // Date de fin de sourdine, ou null pour réactiver le son
  mutedUntil: z.string().datetime().nullable().optional(),
});

// Réglages personnels d'une discussion : épingler, archiver, sourdine
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const member = await getMembership(userId, params.id);
  if (!member) return forbidden();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Réglage invalide.");
  const { pinned, archived, mutedUntil } = parsed.data;

  const data: { pinnedAt?: Date | null; archivedAt?: Date | null; mutedUntil?: Date | null } = {};

  if (pinned === true) {
    if (!member.pinnedAt) {
      const count = await prisma.participant.count({ where: { userId, pinnedAt: { not: null } } });
      if (count >= MAX_PINNED_CONVERSATIONS) {
        return badRequest(`Tu peux épingler ${MAX_PINNED_CONVERSATIONS} discussions au maximum.`);
      }
    }
    data.pinnedAt = member.pinnedAt ?? new Date();
    data.archivedAt = null; // une discussion épinglée ne reste pas archivée
  } else if (pinned === false) {
    data.pinnedAt = null;
  }

  if (archived === true) {
    data.archivedAt = member.archivedAt ?? new Date();
    data.pinnedAt = null;
  } else if (archived === false) {
    data.archivedAt = null;
  }

  if (mutedUntil !== undefined) {
    data.mutedUntil = mutedUntil === null ? null : new Date(mutedUntil);
    if (data.mutedUntil && data.mutedUntil.getTime() <= Date.now()) data.mutedUntil = null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.participant.update({ where: { id: member.id }, data });
    // Tous mes appareils se mettent à jour
    await emitSummaryTo(userId, params.id);
  }

  const conversation = await getConversationSummary(params.id, userId);
  return NextResponse.json({ conversation });
}
