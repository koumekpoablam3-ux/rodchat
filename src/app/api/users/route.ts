import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Taille maximale de l'annuaire renvoyé d'un coup */
const DIRECTORY_SIZE = 200;

// Sans recherche : l'annuaire des personnes inscrites (pour qu'un nouvel arrivant voie qui est déjà là).
// Avec « q » (2 lettres ou plus) : recherche par nom ou nom d'utilisateur.
// On masque les personnes que j'ai bloquées et celles qui m'ont bloqué.
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const searching = q.length >= 2;

  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      blocksGiven: { none: { blockedId: userId } },
      blocksReceived: { none: { blockerId: userId } },
      ...(searching
        ? {
            OR: [
              { username: { contains: q.toLowerCase() } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
    orderBy: { displayName: "asc" },
    take: searching ? 20 : DIRECTORY_SIZE + 1,
  });

  if (searching) return NextResponse.json({ users });

  // `complete` : tout le monde est dans la liste, le navigateur peut filtrer seul sans interroger le serveur
  const complete = users.length <= DIRECTORY_SIZE;
  return NextResponse.json({ users: users.slice(0, DIRECTORY_SIZE), complete });
}
