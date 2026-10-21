import { NextResponse } from "next/server";
import { z } from "zod";
import { displayNameOf } from "@/lib/access";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import {
  announceConversation,
  createGroupConversation,
  getConversationSummary,
  getOrCreateDirectConversation,
  listConversations,
} from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { pushInBackground } from "@/lib/push";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ conversations: await listConversations(userId) });
}

const directSchema = z.object({ userId: z.string().min(1) });

const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Donne un nom au groupe.")
    .max(60, "Le nom du groupe est trop long (60 caractères maximum)."),
  userIds: z
    .array(z.string().min(1))
    .min(1, "Ajoute au moins un participant.")
    .max(256, "Un groupe peut contenir 256 personnes au maximum."),
});

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return unauthorized();

  const body = await req.json().catch(() => null);

  // Discussion à deux
  if (body && typeof body === "object" && "userId" in body) {
    const parsed = directSchema.safeParse(body);
    if (!parsed.success) return badRequest("Choisis une personne.");
    const otherId = parsed.data.userId;
    if (otherId === me) return badRequest("Tu ne peux pas discuter avec toi-même.");

    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) return notFound("Cet utilisateur n'existe pas.");

    const { id, created } = await getOrCreateDirectConversation(me, otherId);
    if (created) await announceConversation(id);

    const conversation = await getConversationSummary(id, me);
    return NextResponse.json({ conversation, created }, { status: created ? 201 : 200 });
  }

  // Groupe
  const parsed = groupSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const memberIds = Array.from(new Set(parsed.data.userIds)).filter((id) => id !== me);
  if (memberIds.length === 0) return badRequest("Ajoute au moins un participant.");

  const found = await prisma.user.count({ where: { id: { in: memberIds } } });
  if (found !== memberIds.length) return badRequest("Un des participants n'existe plus.");

  const id = await createGroupConversation(me, parsed.data.name, memberIds);
  await announceConversation(id);

  // Chaque membre est prévenu de son ajout au groupe
  pushInBackground(memberIds, {
    title: parsed.data.name,
    body: `${await displayNameOf(me)} t'a ajouté au groupe`,
    url: `/chat/${id}`,
    tag: `added:${id}`,
  });

  const conversation = await getConversationSummary(id, me);
  return NextResponse.json({ conversation, created: true }, { status: 201 });
}
