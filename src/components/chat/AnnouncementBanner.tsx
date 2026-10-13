"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";

const KEY = "rodchat-announcement-dismissed";

/** Annonce de l'administrateur : une carte discrète en bas de l'écran, que chacun peut fermer */
export default function AnnouncementBanner() {
  const [text, setText] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/announcement", { cache: "no-store" });
      if (response.ok) setText(((await response.json()) as { text: string | null }).text);
    } catch {
      /* hors ligne : on garde ce qu'on a */
    }
  }, []);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY));
    } catch {
      /* stockage indisponible */
    }
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  if (!text || text === dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-20 z-40 flex items-start gap-3 rounded-2xl bg-ink p-4 text-bg shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:max-w-sm"
    >
      <Megaphone size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{text}</p>
      <button
        type="button"
        aria-label="Fermer l'annonce"
        onClick={() => {
          setDismissed(text);
          try {
            localStorage.setItem(KEY, text);
          } catch {
            /* sans conséquence */
          }
        }}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
      >
        <X size={18} />
      </button>
    </div>
  );
}
