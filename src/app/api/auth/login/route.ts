import { NextResponse } from "next/server";
import { compare, hashSync } from "bcryptjs";
import { z } from "zod";
import { clientIp } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { startSession } from "@/lib/session";
import { serializeUser, userSelect } from "@/lib/users";

// Vrai hash bcrypt (coût 10) généré une fois par instance : comparé quand le compte n'existe pas,
// pour que la réponse ne soit pas plus rapide que pour un compte existant
const DUMMY_HASH = hashSync("rodchat-timing-equalizer", 10);

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

  // Limite par IP + compte, et limite par compte seul (contre un attaquant qui change d'adresse)
  const limit = await rateLimitShared(`login:${clientIp(req)}:${username}`, 8, 10 * 60 * 1000);
  const perAccount = await rateLimitShared(`login-user:${username}`, 40, 60 * 60 * 1000);
  if (!limit.ok || !perAccount.ok) {
    return NextResponse.json(
      { error: `Trop d'essais. Réessaie dans ${Math.max(1, Math.ceil(Math.max(limit.retryAfter, perAccount.retryAfter) / 60))} min.` },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { ...userSelect, passwordHash: true },
  });

  // Même message ET même durée dans les deux cas : on ne révèle pas si le compte existe
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await compare(password, hash);
  if (!user || !valid) {
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
