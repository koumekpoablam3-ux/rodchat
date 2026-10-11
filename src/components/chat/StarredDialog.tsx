"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import type { SearchHit } from "@/types/chat";
import { useChat } from "./ChatProvider";
import SearchHitRow from "./SearchHitRow";

/** Mes messages favoris, tous les messages étoilés de toutes les discussions */
export default function StarredDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { me, starredIds } = useChat();
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ hits: SearchHit[] }>("/api/messages/starred").then((result) => {
      if (cancelled) return;
      if (result.ok) setHits(result.data.hits);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Un favori retiré pendant que la fenêtre est ouverte disparaît de la liste
  const visible = hits?.filter((hit) => starredIds.has(hit.id)) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="starred-title"
        className="rise flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="starred-title" className="font-display text-xl font-bold">
            Messages favoris
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

        <div className="scroll-thin min-h-32 flex-1 overflow-y-auto border-t border-line" aria-live="polite">
          {error ? (
            <p role="alert" className="px-6 py-10 text-center text-sm text-danger">
              {error}
            </p>
          ) : visible === null ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Chargement…</p>
          ) : visible.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              Aucun favori pour l&apos;instant. Ouvre le menu d&apos;un message pour l&apos;ajouter à tes favoris.
            </p>
          ) : (
            <ul>
              {visible.map((hit) => (
                <SearchHitRow
                  key={hit.id}
                  hit={hit}
                  query=""
                  meId={me.id}
                  showConversation
                  onSelect={() => {
                    onClose();
                    router.push(`/chat/${hit.conversationId}?m=${hit.id}`);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
