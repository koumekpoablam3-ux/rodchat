import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { getSessionUser } from "./session";
import type { UserLite } from "@/types/chat";

// Administrateurs : les noms d'utilisateur listés dans ADMIN_USERNAMES (séparés par des virgules).
// C'est la seule source de vérité : aucune action de l'application ne peut donner ce statut à quelqu'un.
export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  const list = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(username.toLowerCase());
}

/** Pour les routes /api/admin : renvoie l'administrateur connecté, ou la réponse d'erreur à retourner telle quelle */
export async function requireAdmin(): Promise<{ admin: UserLite } | { error: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Connecte-toi pour continuer." }, { status: 401 }) };
  }
  // Pour tous les autres : la route « n'existe pas »
  if (!isAdminUsername(user.username)) {
    return { error: NextResponse.json({ error: "Introuvable." }, { status: 404 }) };
  }
  return { admin: user };
}

/** Garde une trace de chaque action d'administration */
export async function logAdmin(
  admin: { id: string; displayName: string; username: string },
  action: string,
  target?: { id?: string | null; name?: string | null },
  details?: string,
) {
  await prisma.adminLog.create({
    data: {
      adminId: admin.id,
      adminName: `${admin.displayName} (@${admin.username})`,
      action,
      targetId: target?.id ?? null,
      targetName: target?.name ?? null,
      details: details?.slice(0, 500) ?? null,
    },
  });
}
