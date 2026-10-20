import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_HASHES = 500;
const schema = z.object({ hashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(MAX_HASHES) });

// Quels contacts de mon carnet d'adresses sont sur Rodchat ? Le navigateur envoie des EMPREINTES de numéros (pas les
// numéros) ; le serveur ne les enregistre pas et ne répond que pour les comptes qui ont un numéro VÉRIFIÉ et qui
// acceptent d'être retrouvés. Il faut avoir soi-même un numéro vérifié : sinon n'importe qui pourrait créer un compte
// pour passer en revue les inscrits.
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { verifiedPhone: true } });
  if (!me?.verifiedPhone) {
    return NextResponse.json(
      { error: "Vérifie d'abord ton numéro (Paramètres → Mon numéro) pour retrouver tes contacts." },
      { status: 403 },
    );
  }
  if (!(await rateLimitShared(`match:${userId}`, 20, 24 * 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Tu as déjà cherché beaucoup de contacts aujourd'hui. Réessaie demain." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Requête invalide.");

  const users = await prisma.user.findMany({
    where: {
      phoneHash: { in: parsed.data.hashes },
      verifiedPhone: { not: null },
      phoneDiscoverable: true,
      suspendedAt: null,
      id: { not: userId },
      // Pas de personnes bloquées, ni qui m'ont bloqué
      blocksGiven: { none: { blockedId: userId } },
      blocksReceived: { none: { blockerId: userId } },
    },
    select: { id: true, displayName: true, avatarUrl: true, phoneHash: true },
  });

  return NextResponse.json(
    {
      matches: users.map((u) => ({
        hash: u.phoneHash,
        user: { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl },
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
