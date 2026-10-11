"use client";

import { useEffect, useState } from "react";
import { FOREVER_ISO, MUTE_OPTIONS } from "@/lib/limits";

type MuteDialogProps = {
  conversationName: string;
  onClose: () => void;
  /** Reçoit la date de fin de sourdine (ISO) */
  onConfirm: (mutedUntil: string) => void;
};

/** Choix de la durée de la sourdine d'une discussion */
export default function MuteDialog({ conversationName, onClose, onConfirm }: MuteDialogProps) {
  const [choice, setChoice] = useState(MUTE_OPTIONS[0].id);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function confirm() {
    const option = MUTE_OPTIONS.find((o) => o.id === choice) ?? MUTE_OPTIONS[0];
    onConfirm(option.ms === null ? FOREVER_ISO : new Date(Date.now() + option.ms).toISOString());
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mute-title"
        className="rise w-full max-w-sm rounded-t-3xl bg-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl md:rounded-3xl"
      >
        <h2 id="mute-title" className="font-display text-xl font-bold">
          Mettre en sourdine
        </h2>
        <p className="mt-1 text-sm text-muted">
          Tu ne recevras plus de notifications de « {conversationName} ». Les messages arrivent quand même.
        </p>

        <fieldset className="mt-4 space-y-1">
          <legend className="sr-only">Durée</legend>
          {MUTE_OPTIONS.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-bg">
              <input
                type="radio"
                name="mute-duration"
                value={option.id}
                checked={choice === option.id}
                onChange={() => setChoice(option.id)}
                className="h-4 w-4 accent-[rgb(var(--brand))]"
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-line font-semibold">
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            className="h-12 flex-1 rounded-xl bg-brand font-semibold text-brand-ink"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
