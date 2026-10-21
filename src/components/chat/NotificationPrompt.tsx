"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { bindPushSubscription, usePush } from "@/hooks/usePush";

const DISMISS_KEY = "rodchat-push-prompt-dismissed";
const DISMISS_DAYS = 7;

/**
 * Notifications : sans elles, un message reçu quand l'application est fermée passe inaperçu.
 * - rattache l'abonnement de cet appareil au compte connecté (un appareil peut changer de compte) ;
 * - se réabonne sans rien demander si la permission est déjà accordée mais que l'abonnement a disparu ;
 * - sinon, propose d'activer les notifications (le navigateur exige un clic de la personne).
 */
export default function NotificationPrompt() {
  const { state, enable } = usePush();
  const [visible, setVisible] = useState(false);
  const bound = useRef(false);

  useEffect(() => {
    if (state === "on" && !bound.current) {
      bound.current = true;
      void bindPushSubscription();
    }
    if (state === "off" && "Notification" in window && Notification.permission === "granted") void enable();
  }, [state, enable]);

  useEffect(() => {
    if (state !== "off" || !("Notification" in window) || Notification.permission !== "default") {
      setVisible(false);
      return;
    }
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY));
      if (at && Date.now() - at < DISMISS_DAYS * 86_400_000) return;
    } catch {
      /* stockage indisponible : on propose quand même */
    }
    const timer = setTimeout(() => setVisible(true), 3000); // on laisse l'application s'afficher d'abord
    return () => clearTimeout(timer);
  }, [state]);

  if (!visible) return null;

  function later() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* stockage indisponible */
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Activer les notifications"
      className="fixed inset-x-3 bottom-20 z-40 flex items-start gap-3 rounded-2xl border border-line bg-panel p-4 shadow-2xl md:inset-x-auto md:bottom-6 md:left-6 md:max-w-sm"
    >
      <Bell size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Ne rate plus rien</p>
        <p className="mt-0.5 text-sm text-muted">
          Reçois une notification pour chaque message, appel ou réaction, même quand Rodchat est fermé.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              void enable();
            }}
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink"
          >
            Activer
          </button>
          <button type="button" onClick={later} className="rounded-full px-3 py-1.5 text-sm text-muted">
            Plus tard
          </button>
        </div>
      </div>
      <button type="button" aria-label="Fermer" onClick={later} className="shrink-0 text-muted">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
