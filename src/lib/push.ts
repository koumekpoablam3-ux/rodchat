import webpush from "web-push";
import { background } from "./background";
import { stripFormatting } from "./formatting";
import { prisma } from "./prisma";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  requireInteraction?: boolean;
  /** Un tag identique remplace la notification précédente ; faux = sans nouvelle sonnerie (réactions, votes) */
  renotify?: boolean;
  /** Affiche la notification même si l'application est au premier plan (bouton « Envoyer un test ») */
  force?: boolean;
  /**
   * Version sans contenu (« Nouveau message »), envoyée à la place aux personnes qui ont désactivé l'aperçu.
   * À renseigner dès que le titre ou le texte révèle le nom de quelqu'un ou le contenu d'un message.
   */
  hide?: { title: string; body: string };
};

let warned = false;

let configured = false;
let configProblem: string | null = null;

/** Une valeur collée dans Vercel garde souvent un espace, un retour à la ligne ou des guillemets : on les retire */
const clean = (value: string | undefined) => (value ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

function configure() {
  if (configured) return true;
  const publicKey = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) {
    configProblem =
      "Clés VAPID absentes : ajoute NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY dans Vercel, puis redéploie.";
    if (!warned) {
      warned = true;
      console.warn("[push]", configProblem);
    }
    return false;
  }
  // Le sujet doit être une adresse « mailto: » ou une adresse https:// ; une simple adresse e-mail est corrigée
  let subject = clean(process.env.VAPID_SUBJECT);
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    subject = subject.includes("@") ? `mailto:${subject}` : "mailto:contact@rodchat.app";
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    configProblem = null;
    return true;
  } catch (error) {
    configProblem = `Clés VAPID invalides (${(error as Error).message}). Génère une nouvelle paire avec « npx web-push generate-vapid-keys » et recopie-la sans espace.`;
    if (!warned) {
      warned = true;
      console.error("[push]", configProblem);
    }
    return false;
  }
}

/** Les notifications sont-elles prêtes sur ce serveur (clés VAPID présentes ET valides) ? */
export function pushConfigured() {
  return configure();
}

/** Ce qui empêche les notifications d'être envoyées, ou null si tout est en ordre */
export function pushProblem() {
  configure();
  return configProblem;
}

/**
 * Envoie une notification push à tous les appareils abonnés de ces utilisateurs.
 * Priorité haute : sur Android, sans elle, le téléphone en veille peut retarder la notification de plusieurs minutes.
 * Si l'application est ouverte et au premier plan sur l'appareil, le service worker n'affiche rien.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const result = { sent: 0, failed: 0, statuses: [] as number[] };
  if (userIds.length === 0 || !configure()) return result;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  // Les personnes qui ont désactivé l'aperçu reçoivent la version sans contenu
  const { hide, ...visible } = payload;
  let noPreview = new Set<string>();
  if (hide) {
    const rows = await prisma.user.findMany({
      where: { id: { in: userIds }, pushPreview: false },
      select: { id: true },
    });
    noPreview = new Set(rows.map((row) => row.id));
  }

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(hide && noPreview.has(sub.userId) ? { ...visible, ...hide } : visible),
          { urgency: "high", TTL: 60 * 60 * 24 },
        );
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        const status = (error as { statusCode?: number }).statusCode;
        if (status) result.statuses.push(status);
        if (status === 404 || status === 410) {
          // Abonnement expiré : on le supprime
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push]", error);
        }
      }
    }),
  );
  return result;
}

/** Envoie sans faire attendre la réponse de la requête en cours */
export function pushInBackground(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return;
  background(sendPushToUsers(userIds, payload));
}

/** Prévient des membres d'une discussion, en respectant la sourdine de chacun (sauf demande contraire) */
export async function notifyMembers(
  conversationId: string,
  userIds: string[],
  payload: PushPayload,
  options: { ignoreMute?: boolean } = {},
) {
  if (userIds.length === 0) return;
  let targets = userIds;
  if (!options.ignoreMute) {
    const muted = await prisma.participant.findMany({
      where: { conversationId, userId: { in: userIds }, mutedUntil: { gt: new Date() } },
      select: { userId: true },
    });
    const mutedIds = new Set(muted.map((m) => m.userId));
    targets = userIds.filter((id) => !mutedIds.has(id));
  }
  pushInBackground(targets, payload);
}

/** Prévient les administrateurs (ADMIN_USERNAMES) */
export async function notifyAdmins(payload: PushPayload) {
  const names = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  if (names.length === 0) return;
  const admins = await prisma.user.findMany({ where: { username: { in: names } }, select: { id: true } });
  pushInBackground(
    admins.map((admin) => admin.id),
    payload,
  );
}

/** Aperçu court d'un message, pour le corps d'une notification */
export function previewOf(type: string, content: string | null | undefined, max = 80) {
  switch (type) {
    case "TEXT":
      return stripFormatting(content ?? "").slice(0, max);
    case "IMAGE":
      return content ? `📷 ${stripFormatting(content).slice(0, max)}` : "Photo";
    case "AUDIO":
      return "Message vocal";
    case "VIDEO":
      return content ? `🎥 ${stripFormatting(content).slice(0, max)}` : "Vidéo";
    case "FILE":
      return "Document";
    case "POLL":
      return (content ?? "").slice(0, max);
    default:
      return "message";
  }
}
