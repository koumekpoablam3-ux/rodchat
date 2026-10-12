"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import { getSocket } from "@/lib/socket";

type Scheduled = { id: string; conversationId: string; content: string; sendAt: string };

type ScheduleDialogProps = {
  conversationId: string;
  /** Texte écrit dans la zone de saisie : c'est lui qui sera programmé */
  text: string;
  /** Appelé quand le message est programmé (la zone de saisie se vide) */
  onScheduled: () => void;
  onClose: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Valeur d'un champ <input type="datetime-local"> (heure locale) */
const toLocalInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Programmer un message : une heure d'envoi, et la liste de ceux qui attendent dans cette discussion */
export default function ScheduleDialog({ conversationId, text, onScheduled, onClose }: ScheduleDialogProps) {
  const [custom, setCustom] = useState(() => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(0, 0, 0);
    return toLocalInput(next);
  });
  const [pending, setPending] = useState<Scheduled[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await apiRequest<{ items: Scheduled[] }>(`/api/scheduled?conversationId=${conversationId}`);
    setPending(result.ok ? result.data.items : []);
  }, [conversationId]);

  useEffect(() => {
    void load();
    // Un message programmé qui n'a pas pu partir (personne bloquée…) : on rafraîchit et on le dit
    const socket = getSocket();
    const onFailed = () => {
      setError("Un message programmé n'a pas pu être envoyé.");
      void load();
    };
    socket.on("scheduled:failed", onFailed);
    return () => {
      socket.off("scheduled:failed", onFailed);
    };
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function schedule(at: Date) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await apiRequest("/api/scheduled", {
      method: "POST",
      json: { conversationId, content: text, sendAt: at.toISOString() },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onScheduled();
    onClose();
  }

  async function cancel(id: string) {
    setPending((list) => list?.filter((item) => item.id !== id) ?? null);
    await apiRequest(`/api/scheduled/${id}`, { method: "DELETE" });
  }

  // Raccourcis : dans 1 h, ce soir 20 h (si pas passé), demain 8 h
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const tonight = new Date(now);
  tonight.setHours(20, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  const presets = [
    { label: "Dans 1 heure", at: inOneHour },
    ...(tonight.getTime() - now.getTime() > 5 * 60 * 1000 ? [{ label: "Ce soir, 20 h", at: tonight }] : []),
    { label: "Demain, 8 h", at: tomorrow },
  ];

  const customDate = new Date(custom);
  const customValid = !Number.isNaN(customDate.getTime()) && customDate.getTime() - Date.now() > 30_000;

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
        aria-labelledby="schedule-title"
        className="rise flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="schedule-title" className="font-display text-xl font-bold">
            Programmer l&apos;envoi
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

        <div className="scroll-thin space-y-4 overflow-y-auto px-5 py-3">
          <blockquote className="line-clamp-4 whitespace-pre-wrap break-words rounded-xl border-l-4 border-brand bg-bg px-3 py-2 text-sm">
            {text}
          </blockquote>

          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={busy}
                onClick={() => void schedule(preset.at)}
                className="h-10 rounded-full border border-line px-4 text-sm font-semibold hover:bg-bg disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="schedule-custom" className="mb-1 block text-sm font-medium">
              Ou choisis le jour et l&apos;heure
            </label>
            <div className="flex gap-2">
              <input
                id="schedule-custom"
                type="datetime-local"
                value={custom}
                min={toLocalInput(new Date(Date.now() + 60_000))}
                onChange={(event) => setCustom(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[15px]"
              />
              <button
                type="button"
                disabled={busy || !customValid}
                onClick={() => void schedule(customDate)}
                className="h-11 shrink-0 rounded-xl bg-brand px-4 font-semibold text-brand-ink disabled:opacity-50"
              >
                Programmer
              </button>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          {pending && pending.length > 0 ? (
            <section>
              <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">
                Déjà programmés ici
              </h3>
              <ul className="divide-y divide-line">
                {pending.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">{item.content}</p>
                      <p className="text-xs text-muted">{when(item.sendAt)}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Annuler ce message programmé"
                      onClick={() => void cancel(item.id)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-danger hover:bg-bg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="pb-2 text-xs text-muted">
            Le message part à l&apos;heure choisie, même si tu as fermé l&apos;application, tant que le service est utilisé à
            ce moment-là. Sinon, il part dès que possible après.
          </p>
        </div>
      </div>
    </div>
  );
}
