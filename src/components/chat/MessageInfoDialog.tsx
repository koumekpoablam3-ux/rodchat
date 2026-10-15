"use client";

import { useEffect, useState } from "react";
import { Check, CheckCheck, Clock, X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import type { MessageInfo } from "@/types/chat";
import Avatar from "./Avatar";

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Infos d'un de mes messages : envoyé, reçu et lu, personne par personne */
export default function MessageInfoDialog({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const [info, setInfo] = useState<MessageInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<MessageInfo>(`/api/messages/${messageId}/info`).then((result) => {
      if (cancelled) return;
      if (result.ok) setInfo(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const read = info?.recipients.filter((r) => r.readAt) ?? [];
  const delivered = info?.recipients.filter((r) => !r.readAt && r.deliveredAt) ?? [];
  const pending = info?.recipients.filter((r) => !r.readAt && !r.deliveredAt) ?? [];

  const group = (title: string, icon: React.ReactNode, people: NonNullable<typeof info>["recipients"], time: "readAt" | "deliveredAt" | null) =>
    people.length === 0 ? null : (
      <section>
        <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-muted">
          {icon} {title} ({people.length})
        </h3>
        <ul className="divide-y divide-line">
          {people.map((person) => (
            <li key={person.user.id} className="flex items-center gap-3 py-2">
              <Avatar id={person.user.id} name={person.user.displayName} avatarUrl={person.user.avatarUrl} size={36} />
              <span className="min-w-0 flex-1 truncate font-medium">{person.user.displayName}</span>
              {time && person[time] ? <span className="text-xs text-muted">{when(person[time] as string)}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    );

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
        aria-labelledby="info-title"
        className="rise flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="info-title" className="font-display text-xl font-bold">
            Infos du message
          </h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg">
            <X size={20} />
          </button>
        </div>

        <div className="scroll-thin space-y-4 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2">
          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>
          ) : !info ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : (
            <>
              <p className="text-sm text-muted">Envoyé le {when(info.sentAt)}</p>
              {group("Lu par", <CheckCheck size={16} className="text-brand" aria-hidden="true" />, read, "readAt")}
              {group("Reçu par", <CheckCheck size={16} aria-hidden="true" />, delivered, "deliveredAt")}
              {group("Envoyé, pas encore reçu par", <Check size={16} aria-hidden="true" />, pending, null)}
              {info.recipients.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Clock size={16} aria-hidden="true" /> Aucune information pour l&apos;instant.
                </p>
              ) : null}
              <p className="text-xs text-muted">
                Les personnes qui ont désactivé leurs accusés de lecture apparaissent comme « reçu », jamais comme « lu ».
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
