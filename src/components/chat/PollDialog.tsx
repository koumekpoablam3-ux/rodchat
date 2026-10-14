"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useChat } from "./ChatProvider";

/** Créer un sondage : une question, 2 à 6 réponses, un ou plusieurs choix */
export default function PollDialog({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { sendPoll } = useChat();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canSend = !busy && question.trim().length > 0 && filled.length >= 2;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError("");
    const problem = await sendPoll(conversationId, { question: question.trim(), options: filled, multiple });
    setBusy(false);
    if (problem) return setError(problem);
    onClose();
  }

  const field = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px]";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-title"
        className="rise flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="poll-title" className="font-display text-xl font-bold">
            Nouveau sondage
          </h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg">
            <X size={20} />
          </button>
        </div>

        <div className="scroll-thin space-y-4 overflow-y-auto px-5 py-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Question</span>
            <input autoFocus className={field} value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder="Quel jour vous convient ?" />
          </label>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">Réponses</legend>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className={field}
                    value={option}
                    maxLength={100}
                    aria-label={`Réponse ${index + 1}`}
                    placeholder={`Réponse ${index + 1}`}
                    onChange={(e) => setOptions((list) => list.map((o, i) => (i === index ? e.target.value : o)))}
                  />
                  {options.length > 2 ? (
                    <button
                      type="button"
                      aria-label={`Retirer la réponse ${index + 1}`}
                      onClick={() => setOptions((list) => list.filter((_, i) => i !== index))}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-bg"
                    >
                      <X size={18} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {options.length < 6 ? (
              <button type="button" onClick={() => setOptions((list) => [...list, ""])} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-brand hover:bg-bg">
                <Plus size={16} aria-hidden="true" /> Ajouter une réponse
              </button>
            ) : null}
          </fieldset>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1">
            <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="h-4 w-4" />
            <span className="text-[15px]">Autoriser plusieurs réponses</span>
          </label>

          {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-line font-semibold">
            Annuler
          </button>
          <button type="submit" disabled={!canSend} className="h-12 flex-1 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-50">
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}
