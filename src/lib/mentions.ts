// Mentions « @pseudo » : mêmes règles côté serveur (notification) et côté navigateur (surbrillance, suggestions).
// Un nom d'utilisateur fait 3 à 20 caractères : lettres, chiffres ou _.

const MENTION = /(^|[^\w@])@([a-z0-9_]{3,20})(?![a-z0-9_])/gi;

/** Noms d'utilisateur mentionnés dans un texte (minuscules, sans doublons) */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION)) found.add(match[2].toLowerCase());
  return Array.from(found);
}

/** Coupe un texte en morceaux : [texte, @pseudo, texte, @pseudo, …] (les rangs impairs sont des mentions) */
export function splitMentions(text: string): string[] {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = (match.index ?? 0) + match[1].length;
    parts.push(text.slice(last, start));
    parts.push(`@${match[2]}`);
    last = start + match[2].length + 1;
  }
  parts.push(text.slice(last));
  return parts;
}

/** « @ali » en cours de frappe juste avant le curseur ? */
export function mentionAtCaret(value: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([a-z0-9_]{0,20})$/i.exec(value.slice(0, caret));
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null;
}
