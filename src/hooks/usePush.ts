"use client";

import { useCallback, useEffect, useState } from "react";
import { SW_ENABLED, VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/pwa";

export type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Rattache l'abonnement de ce navigateur au compte connecté. Un même appareil peut changer de compte :
 * sans cela, les notifications continueraient d'aller vers l'ancien.
 */
export async function bindPushSubscription() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/push/subscribe", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(subscription.toJSON()) });
  } catch {
    /* sans importance : réessayé au prochain chargement */
  }
}

/** À la déconnexion : cet appareil ne doit plus recevoir les notifications de ce compte (2 s d'attente au plus) */
export async function unbindPushSubscription() {
  const work = (async () => {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  })().catch(() => {});
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

/** Abonnement aux notifications push de cet appareil */
export function usePush() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    const supported =
      SW_ENABLED &&
      VAPID_PUBLIC_KEY !== "" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  const enable = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      setState(response.ok ? "on" : "off");
    } catch (error) {
      console.error("Activation des notifications impossible :", error);
      setState("off");
    }
  }, []);

  const disable = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
    } catch (error) {
      console.error("Désactivation des notifications impossible :", error);
    }
    setState("off");
  }, []);

  return { state, enable, disable };
}
