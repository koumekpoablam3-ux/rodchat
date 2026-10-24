// Introduction de l'application (4 écrans, la première fois). Mémorisée par compte sur l'appareil : quelqu'un qui
// se connecte avec un autre compte la voit pour ce compte, et elle ne revient pas à chaque ouverture.

export const INTRO_EVENT = "rodchat:intro";

export const introKey = (userId: string) => `rodchat-intro:${userId}`;

export function introSeen(userId: string) {
  try {
    return localStorage.getItem(introKey(userId)) !== null;
  } catch {
    // Stockage indisponible : on ne l'affiche pas, sinon elle reviendrait à chaque ouverture
    return true;
  }
}

export function markIntroSeen(userId: string) {
  try {
    localStorage.setItem(introKey(userId), String(Date.now()));
  } catch {
    /* sans importance */
  }
}

/** Demande à l'introduction de s'ouvrir (Paramètres → Revoir l'introduction) */
export function replayIntro() {
  window.dispatchEvent(new Event(INTRO_EVENT));
}
