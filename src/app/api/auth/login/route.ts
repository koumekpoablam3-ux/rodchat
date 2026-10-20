import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { compare, hashSync } from "bcryptjs";
import { z } from "zod";
import { clientIp } from "@/lib/api";
import { phoneCandidates } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { startSession } from "@/lib/session";
import { serializeUser, userSelect } from "@/lib/users";

// Vrai hash bcrypt (coût 10) généré une fois par instance : comparé quand le compte n'existe pas,
// pour que la réponse ne soit pas plus rapide que pour un compte existant
const DUMMY_HASH = hashSync("rodchat-timing-equalizer", 10);

const schema = z.object({
  // Nom d'utilisateur, ou numéro de téléphone avec l'indicatif (« +225… »)
  username: z.string().trim().toLowerCase().min(1, "Indique ton numéro ou ton nom d'utilisateur."),
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

  const loginSelect = { ...userSelect, passwordHash: true, suspendedAt: true, phone: true, verifiedPhone: true } as const;
  type LoginRow = Prisma.UserGetPayload<{ select: typeof loginSelect }>;
  let user: LoginRow | null = null;
  let valid = false;

  const phones = phoneCandidates(username);
  if (phones.length > 0) {
    // Connexion par numéro (avec ou sans indicatif). Le compte qui a VÉRIFIÉ ce numéro l'emporte ; sinon on regarde
    // les comptes qui l'annoncent seulement. Plusieurs peuvent l'annoncer (essais, erreurs) : le mot de passe
    // départage, et si deux comptes ont le même mot de passe on ne choisit pas.
    const accounts = await prisma.user.findMany({
      where: { OR: [{ verifiedPhone: { in: phones } }, { phone: { in: phones } }] },
      select: loginSelect,
      take: 6,
    });
    const verified = accounts.filter((account) => account.verifiedPhone && phones.includes(account.verifiedPhone));
    const pool = verified.length > 0 ? verified : accounts;
    const matching: LoginRow[] = [];
    for (const account of pool) {
      if (await compare(password, account.passwordHash)) matching.push(account);
    }
    if (pool.length === 0) await compare(password, DUMMY_HASH); // même durée qu'un compte existant
    if (matching.length === 1) {
      user = matching[0];
      valid = true;
    }
  } else {
    user = await prisma.user.findUnique({ where: { username }, select: loginSelect });
    // Même message ET même durée dans les deux cas : on ne révèle pas si le compte existe
    valid = await compare(password, user?.passwordHash ?? DUMMY_HASH);
  }

  if (!user || !valid) {
    return NextResponse.json(
      { error: "Numéro, nom d'utilisateur ou mot de passe incorrect." },
      { status: 401 },
    );
  }

  // Le mot de passe est bon mais le compte a été suspendu par un administrateur
  if (user.suspendedAt) {
    return NextResponse.json(
      { error: "Ce compte a été suspendu. Contacte l'administrateur du service." },
      { status: 403 },
    );
  }

  await startSession(user.id);
  const {
    passwordHash: _passwordHash,
    suspendedAt: _suspendedAt,
    phone: _phone,
    verifiedPhone: _verifiedPhone,
    ...publicUser
  } = user;
  void _passwordHash;
  void _suspendedAt;
  void _phone;
  void _verifiedPhone;
  return NextResponse.json({ user: serializeUser(publicUser) });
}
