import { createHash, timingSafeEqual } from "crypto";

/** Le code saisi correspond-il au code attendu ? Comparaison à durée constante (empreintes de même taille). */
export function inviteMatches(expected: string, candidate: string | undefined): boolean {
  if (!expected) return false;
  const digest = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest();
  return timingSafeEqual(digest(candidate ?? ""), digest(expected));
}
