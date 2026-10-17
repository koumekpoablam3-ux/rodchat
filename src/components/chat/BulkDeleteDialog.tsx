"use client";

import { useEffect } from "react";

type BulkDeleteDialogProps = {
  count: number;
  /** Tous les messages choisis sont les miens, récents et supprimables pour tout le monde */
  canDeleteForAll: boolean;
  busy: boolean;
  onForMe: () => void;
  onForAll: () => void;
  onClose: () => void;
};

/** Suppression de plusieurs messages à la fois : pour moi, ou pour tout le monde quand c'est possible */
export default function BulkDeleteDialog({ count, canDeleteForAll, busy, onForMe, onForAll, onClose }: BulkDeleteDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-title"
        className="rise w-full max-w-sm rounded-t-3xl bg-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl md:rounded-3xl"
      >
        <h2 id="bulk-delete-title" className="font-display text-xl font-bold">
          Supprimer {count} message{count > 1 ? "s" : ""} ?
        </h2>
        <div className="mt-4 space-y-2">
          {canDeleteForAll ? (
            <button type="button" disabled={busy} onClick={onForAll} className="h-12 w-full rounded-xl bg-danger font-semibold text-white disabled:opacity-60">
              Supprimer pour tout le monde
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onForMe}
            className={`h-12 w-full rounded-xl font-semibold disabled:opacity-60 ${canDeleteForAll ? "border border-line" : "bg-danger text-white"}`}
          >
            Supprimer pour moi
          </button>
          <button type="button" onClick={onClose} className="h-12 w-full rounded-xl font-semibold text-muted hover:bg-bg">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
