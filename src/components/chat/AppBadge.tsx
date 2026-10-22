"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "./ChatProvider";

const BADGE_CACHE = "rodchat-badge";
const BADGE_KEY = "/__badge";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Montre qu'il y a quelque chose à lire :
 * - une pastille avec le nombre de discussions non lues sur l'icône de l'application installée (barre des tâches,
 *   Dock, écran d'accueil) ;
 * - ce nombre entre parenthèses dans le titre de l'onglet.
 * Les discussions en sourdine ou archivées ne comptent pas, sauf s'il y a une mention.
 * Quand l'application est fermée, c'est le service worker qui incrémente la pastille à chaque notification reçue.
 */
export default function AppBadge() {
  const { conversations } = useChat();
  const pathname = usePathname();

  const now = Date.now();
  const count = conversations.filter((conversation) => {
    if (conversation.unreadCount <= 0 && !conversation.markedUnread) return false;
    if (conversation.hasUnreadMention) return true;
    const muted = conversation.mutedUntil ? new Date(conversation.mutedUntil).getTime() > now : false;
    return !muted && !conversation.archivedAt;
  }).length;

  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    try {
      if (count > 0) void nav.setAppBadge?.(count);
      else void nav.clearAppBadge?.();
    } catch {
      /* pastille non prise en charge : sans importance */
    }
    // Le service worker repart de ce nombre pour les notifications reçues application fermée
    if ("caches" in window) {
      void caches
        .open(BADGE_CACHE)
        .then((cache) => cache.put(BADGE_KEY, new Response(String(count))))
        .catch(() => {});
    }
  }, [count]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
  }, [count, pathname]);

  return null;
}
