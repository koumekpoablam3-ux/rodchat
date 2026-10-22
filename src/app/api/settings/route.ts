import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { THEME_COOKIE } from "@/lib/theme";

const settingsSelect = { theme: true, readReceipts: true, lastSeenVisible: true, pushPreview: true } as const;

const schema = z.object({
  theme: z.enum(["auto", "light", "dark"]).optional(),
  readReceipts: z.boolean().optional(),
  lastSeenVisible: z.boolean().optional(),
  pushPreview: z.boolean().optional(),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const settings = await prisma.user.findUnique({ where: { id: userId }, select: settingsSelect });
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Réglage invalide.");

  const settings = await prisma.user.update({ where: { id: userId }, data: parsed.data, select: settingsSelect });
  const response = NextResponse.json({ settings });

  // Le thème est aussi gardé dans un cookie : la page s'affiche directement dans le bon thème, sans clignotement
  if (parsed.data.theme) {
    response.cookies.set(THEME_COOKIE, parsed.data.theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return response;
}
