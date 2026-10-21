/* Service worker Rodchat
   - garde en cache les fichiers statiques (cache d'abord, ils sont versionnés par Next.js)
   - affiche une page « hors connexion » quand une page ne peut pas être chargée
   - reçoit les notifications push et ouvre la bonne discussion au clic
   Les appels /api (dont le flux temps réel) ne passent jamais par le cache. */

const VERSION = "rodchat-v2";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Pages : réseau d'abord, page hors connexion en secours
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Fichiers statiques : cache d'abord
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // L'app est ouverte, visible ET active : la personne la regarde, inutile de la notifier.
      // Une fenêtre simplement visible mais passée au second plan (autre application devant) ne compte pas.
      const watching = windows.some((client) => client.visibilityState === "visible" && client.focused);
      // Safari (iPhone, iPad, Mac) supprime l'abonnement d'une app qui reçoit des notifications sans en afficher :
      // on en affiche une, sans bruit, et on la retire aussitôt.
      const ua = self.navigator.userAgent;
      const safari = /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(ua);
      if (watching && !safari) return;

      const tag = data.tag || "rodchat";
      await self.registration.showNotification(data.title || "Rodchat", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        tag,
        // Un nouveau message dans la même discussion remplace la notification ET sonne à nouveau
        renotify: data.renotify !== false,
        silent: watching,
        requireInteraction: !watching && data.requireInteraction === true,
        vibrate: [120, 60, 120],
        data: { url: data.url || "/chat" },
      });
      if (watching) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const shown = await self.registration.getNotifications({ tag });
        shown.forEach((notification) => notification.close());
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* navigation refusée : la fenêtre reste au premier plan */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
