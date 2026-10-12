import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { clientIp } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { startSession } from "@/lib/session";
import { serializeUser, userSelect } from "@/lib/users";

const schema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "Le nom d'utilisateur doit faire 3 à 20 caractères : lettres, chiffres ou _."),
  displayName: z
    .string()
    .trim()
    .min(1, "Indique le nom que les autres verront.")
    .max(40, "Ton nom est trop long (40 caractères maximum)."),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères.")
    .max(72, "Le mot de passe est trop long (72 caractères maximum)."),
});

export async function POST(req: Request) {
  const limit = await rateLimitShared(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Trop de tentatives. Réessaie dans ${Math.ceil(limit.retryAfter / 60)} min.` },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, displayName, password } = parsed.data;

  const taken = { error: "Ce nom d'utilisateur est déjà pris. Essaie-en un autre." };

  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) return NextResponse.json(taken, { status: 409 });

  try {
    const user = await prisma.user.create({
      data: { username, displayName, passwordHash: await hash(password, 10) },
      select: userSelect,
    });
    await startSession(user.id);
    return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(taken, { status: 409 });
    }
    throw error;
  }
}
