import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api";
import { displayNameOf, getMembership } from "@/lib/access";
import { broadcastConversation, getConversationSummary, postSystemMessage } from "@/lib/conversations";
import {
  DISAPPEARING_OPTIONS,
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  disappearingLabel,
} from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1, "Donne un nom au groupe.").max(MAX_GROUP_NAME, "Le nom du groupe est trop long.").optional(),
  description: z.string().trim().max(MAX_GROUP_DESCRIPTION, "La description est trop longue.").nullable().optional(),
  disappearingSeconds: z
    .number()
    .nullable()
    .refine((value) => DISAPPEARING_OPTIONS.some((o) => o.seconds === value), "Durée non proposée.")
    .optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const conversation = await getConversationSummary(params.id, userId);
  if (!conversation) return notFound("Cette discussion n'existe pas.");
  return NextResponse.json({ conversation });
}

// Nom, description (groupes) et messages éphémères
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const member = await getMembership(userId, params.id);
  if (!member) return forbidden();
  const { isGroup } = member.conversation;
  const isAdmin = member.role === "ADMIN";

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const { name, description, disappearingSeconds } = parsed.data;

  if ((name !== undefined || description !== undefined) && !isGroup) {
    return badRequest("Seuls les groupes ont un nom et une description.");
  }
  if (isGroup && !isAdmin) return forbidden();

  const actor = await displayNameOf(userId);
  const notes: string[] = [];
  const data: { name?: string; description?: string | null; disappearingSeconds?: number | null } = {};

  if (name !== undefined && name !== member.conversation.name) {
    data.name = name;
    notes.push(`${actor} a changé le nom du groupe en « ${name} »`);
  }
  if (description !== undefined) {
    data.description = description === "" ? null : description;
    notes.push(`${actor} a modifié la description du groupe`);
  }
  if (disappearingSeconds !== undefined) {
    const current = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: { disappearingSeconds: true },
    });
    if (current?.disappearingSeconds !== disappearingSeconds) {
      data.disappearingSeconds = disappearingSeconds;
      notes.push(
        disappearingSeconds === null
          ? `${actor} a désactivé les messages éphémères`
          : `${actor} a activé les messages éphémères (${disappearingLabel(disappearingSeconds)})`,
      );
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.conversation.update({ where: { id: params.id }, data });
    for (const note of notes) await postSystemMessage(params.id, userId, note);
    await broadcastConversation(params.id);
  }

  const conversation = await getConversationSummary(params.id, userId);
  return NextResponse.json({ conversation });
}
