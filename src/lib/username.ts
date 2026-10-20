import { prisma } from "./prisma";

/** « Koffi Mensah » → « koffi_mensah » (lettres, chiffres et _ seulement, sans accents) */
function slug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 12);
  return base.length >= 3 ? base : "user";
}

/**
 * Identifiant unique généré à l'inscription (le numéro de téléphone remplace le choix d'un nom d'utilisateur).
 * Il sert aux mentions (@koffi_4821) et à la connexion ; on peut toujours se connecter avec son numéro.
 */
export async function generateUsername(displayName: string): Promise<string> {
  const base = slug(displayName);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  // Très improbable : on allonge le suffixe
  return `${base}_${Date.now().toString(36).slice(-6)}`;
}
