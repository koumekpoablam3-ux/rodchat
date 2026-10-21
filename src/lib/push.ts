import webpush from "web-push";
import { background } from "./background";
import { prisma } from "./prisma";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  requireInteraction?: boolean;
  /** Un tag identique remplace la notification précédente ; faux = sans nouvelle sonnerie (réactions, votes) */
  renotify?: boolean;
};

let configured = false;

function configure() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@rodchat.app",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/** Les notifications sont-elles configurées sur ce serveur (clés VAPID) ? */
export function pushConfigured() {
  return configured || Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Envoie une notification push à tous les appareils abonnés de ces utilisateurs.
 * Priorité haute : sur Android, sans elle, le téléphone en veille peut retarder la notification de plusieurs minutes.
 * Si l'application est ouverte et au premier plan sur l'appareil, le service worker n'affiche rien.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0 || !configure()) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { urgency: "high", TTL: 60 * 60 * 24 },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Abonnement expiré : on le supprime
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push]", error);
        }
      }
    }),
  );
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
      return (content ?? "").slice(0, max);
    case "IMAGE":
      return "Photo";
    case "AUDIO":
      return "Message vocal";
    case "VIDEO":
      return "Vidéo";
    case "FILE":
      return "Document";
    case "POLL":
      return (content ?? "").slice(0, max);
    default:
      return "message";
  }
}
