import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { MAX_ABOUT, MAX_DISPLAY_NAME } from "@/lib/limits";
import { broadcastUser } from "@/lib/profile";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { serializeUser, userSelect } from "@/lib/users";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Le nom ne peut pas être vide.")
    .max(MAX_DISPLAY_NAME, `Le nom est trop long (${MAX_DISPLAY_NAME} caractères maximum).`)
    .optional(),
  about: z.string().trim().max(MAX_ABOUT, `L'info est trop longue (${MAX_ABOUT} caractères maximum).`).optional(),
});

// Modifier mon nom et mon info
export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { displayName: parsed.data.displayName, about: parsed.data.about },
    select: userSelect,
  });
  await broadcastUser(userId);
  return NextResponse.json({ user: serializeUser(user) });
}
