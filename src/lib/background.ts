import { waitUntil } from "@vercel/functions";

/**
 * Lance un travail sans faire attendre la réponse (notifications push, aperçu de lien).
 * Sur Vercel, une fonction est gelée dès qu'elle a répondu : `waitUntil` la garde en vie jusqu'à la fin du travail.
 * Ailleurs (service temps réel, développement), le travail continue simplement tout seul.
 */
export function background(work: Promise<unknown>) {
  const safe = work.catch((error) => console.error("[background]", error));
  try {
    waitUntil(safe);
  } catch {
    /* pas dans un contexte Vercel : rien à faire */
  }
}
