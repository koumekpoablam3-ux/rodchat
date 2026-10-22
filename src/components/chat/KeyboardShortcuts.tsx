"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChat } from "./ChatProvider";

/**
 * Raccourcis clavier (ordinateur) :
 *   Ctrl/⌘ + K        chercher une discussion ou un message
 *   Alt + ↑ / Alt + ↓  discussion précédente / suivante
 * (Entrée envoie, Maj + Entrée passe à la ligne, Ctrl/⌘ + B et I mettent en gras et en italique : voir le compositeur.)
 */
export default function KeyboardShortcuts() {
  const { conversations } = useChat();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        const input = document.querySelector<HTMLInputElement>('input[type="search"][placeholder="Rechercher"]');
        if (input) {
          event.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }

      if (event.altKey && !mod && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        const list = conversations.filter((conversation) => !conversation.archivedAt);
        if (list.length === 0) return;
        const currentId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
        const index = list.findIndex((conversation) => conversation.id === currentId);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = index === -1 ? (step === 1 ? 0 : list.length - 1) : (index + step + list.length) % list.length;
        event.preventDefault();
        router.push(`/chat/${list[next].id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conversations, pathname, router]);

  return null;
}
