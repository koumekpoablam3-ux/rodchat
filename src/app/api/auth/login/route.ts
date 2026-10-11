import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { clientIp } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { startSession } from "@/lib/session";
import { serializeUser, userSelect } from "@/lib/users";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Indique ton nom d'utilisateur."),
  password: z.string().min(1, "Indique ton mot de passe."),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const limit = rateLimit(`login:${clientIp(req)}:${username}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Trop d'essais. Réessaie dans ${Math.ceil(limit.retryAfter / 60)} min.` },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { ...userSelect, passwordHash: true },
  });

  // Même message dans les deux cas : on ne révèle pas si le compte existe
  if (!user || !(await compare(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Nom d'utilisateur ou mot de passe incorrect." },
      { status: 401 },
    );
  }

  await startSession(user.id);
  const { passwordHash: _passwordHash, ...publicUser } = user;
  void _passwordHash;
  return NextResponse.json({ user: serializeUser(publicUser) });
}
