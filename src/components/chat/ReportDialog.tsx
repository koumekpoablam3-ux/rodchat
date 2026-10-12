"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";

type ReportDialogProps = {
  /** Message signalé (la personne qui l'a écrit est retrouvée côté serveur) ou personne signalée */
  messageId?: string;
  userId?: string;
  name: string;
  onClose: () => void;
};

/** Signaler un message ou une personne : un motif, des précisions facultatives */
export default function ReportDialog({ messageId, userId, name, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setError("");
    const result = await apiRequest("/api/reports", { method: "POST", json: { messageId, userId, reason, details } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSent(true);
  }

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
        aria-labelledby="report-title"
        className="rise flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="report-title" className="font-display text-xl font-bold">
            {sent ? "Merci" : messageId ? "Signaler ce message" : `Signaler ${name}`}
          </h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg"
          >
            <X size={20} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 pb-6 pt-2">
            <p className="text-[15px]">
              Ton signalement a bien été envoyé. Il sera examiné. La personne n&apos;est pas prévenue. Tu peux aussi la
              bloquer depuis ses infos de contact.
            </p>
            <button type="button" onClick={onClose} className="mt-5 h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink">
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div className="scroll-thin space-y-4 overflow-y-auto px-5 py-3">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Pourquoi signales-tu {messageId ? "ce message" : name} ?</legend>
                <div className="space-y-1">
                  {REPORT_REASONS.map((item) => (
                    <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-bg">
                      <input
                        type="radio"
                        name="reason"
                        checked={reason === item.id}
                        onChange={() => setReason(item.id)}
                        className="h-4 w-4 accent-[rgb(var(--brand,98_62_160))]"
                      />
                      <span className="text-[15px]">{item.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Précisions (facultatif)</span>
                <textarea
                  value={details}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => setDetails(event.target.value)}
                  className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-[15px]"
                />
              </label>
              {error ? (
                <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2 border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-line font-semibold">
                Annuler
              </button>
              <button
                type="button"
                disabled={!reason || busy}
                onClick={() => void submit()}
                className="h-12 flex-1 rounded-xl bg-danger font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Envoi…" : "Signaler"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
