import { createHash, timingSafeEqual } from "crypto";

// Code d'invitation à l'inscription (facultatif) : si la variable INVITE_CODE est définie, il faut le connaître
// pour créer un compte. Sans elle, l'inscription reste ouverte à tout le monde.

export function inviteRequired(): boolean {
  return Boolean(process.env.INVITE_CODE?.trim());
}

/** Comparaison à durée constante (on compare des empreintes de même taille) */
export function inviteMatches(candidate: string | undefined): boolean {
  const expected = process.env.INVITE_CODE?.trim();
  if (!expected) return true;
  const digest = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest();
  return timingSafeEqual(digest(candidate ?? ""), digest(expected));
}
