"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useMessageSearch } from "@/hooks/useMessageSearch";
import { useChat } from "./ChatProvider";
import SearchHitRow from "./SearchHitRow";

type ConversationSearchProps = {
  conversationId: string;
  onClose: () => void;
  /** Aller au message choisi */
  onSelect: (messageId: string) => void;
};

/** Recherche dans une seule discussion : remplace l'en-tête, résultats au-dessus des messages */
export default function ConversationSearch({ conversationId, onClose, onSelect }: ConversationSearchProps) {
  const { me } = useChat();
  const [query, setQuery] = useState("");
  const { hits, loading, error } = useMessageSearch(query, conversationId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const q = query.trim();

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la recherche"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-bg"
        >
          <ArrowLeft size={22} />
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Rechercher dans la discussion</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans la discussion"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-line bg-bg px-4 placeholder:text-muted"
          />
        </label>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto" aria-live="polite">
        {q.length < 2 ? (
          <p className="px-6 py-10 text-center text-sm text-muted">Tape au moins 2 lettres pour chercher un message.</p>
        ) : error ? (
          <p role="alert" className="px-6 py-10 text-center text-sm text-danger">
            {error}
          </p>
        ) : loading && hits.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted">Recherche en cours…</p>
        ) : hits.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted">Aucun message ne contient « {q} ».</p>
        ) : (
          <ul>
            {hits.map((hit) => (
              <SearchHitRow
                key={hit.id}
                hit={hit}
                query={q}
                meId={me.id}
                showConversation={false}
                onSelect={() => {
                  onSelect(hit.id);
                  onClose();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
