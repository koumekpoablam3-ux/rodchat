"use client";

/**
 * Invite quelqu'un : ouvre le menu de partage du système (WhatsApp, SMS, e-mail…) avec l'adresse de l'application,
 * ou copie le lien si le navigateur ne sait pas partager.
 * « failed » : partage annulé, ou copie impossible.
 * (Ne pas confondre avec lib/invite.ts, qui vérifie le code d'invitation à l'inscription.)
 */
export async function shareInvite(): Promise<"shared" | "copied" | "failed"> {
  const url = window.location.origin;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Rodchat", text: "Rejoins-moi sur Rodchat :", url });
      return "shared";
    } catch {
      return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(`Rejoins-moi sur Rodchat : ${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
