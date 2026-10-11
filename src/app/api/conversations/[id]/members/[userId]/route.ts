import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { displayNameOf, getMembership } from "@/lib/access";
import { broadcastConversation, getConversationSummary, postSystemMessage } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { getRealtime } from "@/lib/realtime";
import { getSessionUserId } from "@/lib/session";

const roleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

// Nommer ou retirer un administrateur
export async function PATCH(req: Request, { params }: { params: { id: string; userId: string } }) {
  const me = await getSessionUserId();
  if (!me) return unauthorized();

  const member = await getMembership(me, params.id);
  if (!member) return forbidden();
  if (!member.conversation.isGroup) return badRequest("Il n'y a pas d'administrateurs dans une discussion à deux.");
  if (member.role !== "ADMIN") return forbidden();

  const parsed = roleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Rôle invalide.");

  const target = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId: params.userId, conversationId: params.id } },
    select: { id: true, role: true, user: { select: { displayName: true } } },
  });
  if (!target) return notFound("Cette personne ne fait plus partie du groupe.");
  if (target.role === parsed.data.role) {
    return NextResponse.json({ conversation: await getConversationSummary(params.id, me) });
  }

  // Un groupe garde toujours au moins un administrateur
  if (parsed.data.role === "MEMBER") {
    const admins = await prisma.participant.count({ where: { conversationId: params.id, role: "ADMIN" } });
    if (admins <= 1) return badRequest("Le groupe doit garder au moins un administrateur.");
  }

  await prisma.participant.update({ where: { id: target.id }, data: { role: parsed.data.role } });

  const actor = await displayNameOf(me);
  await postSystemMessage(
    params.id,
    me,
    parsed.data.role === "ADMIN"
      ? `${actor} a nommé ${target.user.displayName} administrateur`
      : `${actor} a retiré ${target.user.displayName} des administrateurs`,
  );
  await broadcastConversation(params.id);

  return NextResponse.json({ conversation: await getConversationSummary(params.id, me) });
}

// Retirer quelqu'un du groupe (administrateurs), ou quitter le groupe soi-même
export async function DELETE(_req: Request, { params }: { params: { id: string; userId: string } }) {
  const me = await getSessionUserId();
  if (!me) return unauthorized();

  const member = await getMembership(me, params.id);
  if (!member) return forbidden();
  if (!member.conversation.isGroup) return badRequest("On ne quitte pas une discussion à deux.");

  const leaving = params.userId === me;
  if (!leaving && member.role !== "ADMIN") return forbidden();

  const target = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId: params.userId, conversationId: params.id } },
    select: { id: true, role: true, user: { select: { displayName: true } } },
  });
  if (!target) return notFound("Cette personne ne fait plus partie du groupe.");

  await prisma.participant.delete({ where: { id: target.id } });

  const realtime = getRealtime();
  // La personne retirée ne reçoit plus rien de cette discussion
  await realtime?.leaveUser(params.userId, `conv:${params.id}`);
  await realtime?.emit(`user:${params.userId}`, "conversation:removed", { id: params.id });

  const remaining = await prisma.participant.findMany({
    where: { conversationId: params.id },
    orderBy: { joinedAt: "asc" },
    select: { id: true, role: true, userId: true, user: { select: { displayName: true } } },
  });

  // Plus personne : le groupe disparaît
  if (remaining.length === 0) {
    await prisma.conversation.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  }

  const actor = await displayNameOf(me);
  await postSystemMessage(
    params.id,
    // Si je pars, la ligne est postée au nom de quelqu'un qui reste
    leaving ? remaining[0].userId : me,
    leaving ? `${target.user.displayName} a quitté le groupe` : `${actor} a retiré ${target.user.displayName}`,
  );

  // Le dernier administrateur est parti : le membre le plus ancien reprend le rôle
  if (!remaining.some((p) => p.role === "ADMIN")) {
    const next = remaining[0];
    await prisma.participant.update({ where: { id: next.id }, data: { role: "ADMIN" } });
    await postSystemMessage(params.id, next.userId, `${next.user.displayName} est maintenant administrateur`);
  }

  await broadcastConversation(params.id);
  return NextResponse.json({ ok: true });
}
