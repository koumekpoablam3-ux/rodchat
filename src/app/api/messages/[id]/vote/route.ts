import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { displayNameOf } from "@/lib/access";
import { background } from "@/lib/background";
import { broadcastMessageUpdate, loadMessage } from "@/lib/messages";
import { notifyMembers } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({ optionIds: z.array(z.string().max(40)).max(6) });

// Voter (ou changer son vote, ou le retirer avec une liste vide). Les autres voient le résultat se mettre à jour.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!rateLimit(`vote:${userId}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Doucement ! Réessaie dans un instant." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Requête invalide.");

  const message = await prisma.message.findUnique({
    where: { id: params.id },
    select: {
      conversationId: true,
      createdAt: true,
      deletedAt: true,
      type: true,
      senderId: true,
      content: true,
      poll: { select: { multiple: true, options: { select: { id: true } } } },
    },
  });
  if (!message || message.type !== "POLL" || !message.poll || message.deletedAt) return notFound("Ce sondage n'existe plus.");

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: message.conversationId } },
    select: { joinedAt: true },
  });
  if (!member || message.createdAt < member.joinedAt) return forbidden();

  const validIds = new Set(message.poll.options.map((o) => o.id));
  const chosen = Array.from(new Set(parsed.data.optionIds));
  if (chosen.some((id) => !validIds.has(id))) return badRequest("Réponse inconnue.");
  if (!message.poll.multiple && chosen.length > 1) return badRequest("Ce sondage n'accepte qu'une seule réponse.");

  // Mon vote remplace le précédent, en une seule opération
  await prisma.$transaction([
    prisma.pollVote.deleteMany({ where: { userId, optionId: { in: Array.from(validIds) } } }),
    prisma.pollVote.createMany({ data: chosen.map((optionId) => ({ optionId, userId })) }),
  ]);

  // L'auteur du sondage est prévenu des nouveaux votes
  if (chosen.length > 0 && message.senderId !== userId) {
    const author = message.senderId;
    background(
      (async () => {
        const actor = await displayNameOf(userId);
        await notifyMembers(message.conversationId, [author], {
          title: actor,
          body: `a voté à ton sondage : ${(message.content ?? "").slice(0, 80)}`,
          url: `/chat/${message.conversationId}`,
          tag: `vote:${params.id}:${userId}`,
          renotify: false,
          hide: { title: "Rodchat", body: "Nouveau vote à ton sondage" },
        });
      })(),
    );
  }

  const updated = await loadMessage(params.id);
  if (updated) await broadcastMessageUpdate(updated);
  return NextResponse.json({ message: updated });
}
