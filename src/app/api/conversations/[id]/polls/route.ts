import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { BlockedError, blockedMessage } from "@/lib/blocks";
import { postMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(1, "Écris la question.").max(200, "La question est trop longue (200 caractères maximum)."),
  options: z
    .array(z.string().trim().min(1, "Une réponse est vide.").max(100, "Une réponse est trop longue (100 caractères maximum)."))
    .min(2, "Ajoute au moins deux réponses.")
    .max(6, "Six réponses au maximum."),
  multiple: z.boolean().default(false),
});

// Envoyer un sondage dans une discussion
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`poll:${userId}`, 20, 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Tu as envoyé beaucoup de sondages. Réessaie plus tard." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const { question, multiple } = parsed.data;

  // Deux réponses identiques n'ont pas de sens
  const options = Array.from(new Map(parsed.data.options.map((text) => [text.toLowerCase(), text])).values());
  if (options.length < 2) return badRequest("Les réponses doivent être différentes.");

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: params.id } },
    select: { id: true },
  });
  if (!member) return forbidden();

  try {
    const message = await postMessage({
      senderId: userId,
      conversationId: params.id,
      type: "POLL",
      content: question,
      poll: { question, options, multiple },
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof BlockedError) return NextResponse.json({ error: blockedMessage(error.byMe) }, { status: 403 });
    throw error;
  }
}
