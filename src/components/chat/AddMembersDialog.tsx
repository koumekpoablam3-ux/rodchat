"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { UserLite } from "@/types/chat";
import Avatar from "./Avatar";
import { useChat } from "./ChatProvider";

type Brief = Pick<UserLite, "id" | "username" | "displayName" | "avatarUrl">;

type AddMembersDialogProps = {
  conversationId: string;
  /** Personnes déjà dans le groupe : elles n'apparaissent pas dans les résultats */
  memberIds: string[];
  onClose: () => void;
};

/** Ajouter des personnes à un groupe existant */
export default function AddMembersDialog({ conversationId, memberIds, onClose }: AddMembersDialogProps) {
  const { addMembers } = useChat();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Brief[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Brief[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/users?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await response.json()) as { users?: Brief[] };
        setResults(response.ok ? (data.users ?? []).filter((u) => !memberIds.includes(u.id)) : []);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, memberIds]);

  function toggle(user: Brief) {
    setSelected((current) =>
      current.some((u) => u.id === user.id) ? current.filter((u) => u.id !== user.id) : [...current, user],
    );
  }

  async function submit() {
    if (selected.length === 0) return setError("Choisis au moins une personne.");
    setBusy(true);
    setError("");
    const problem = await addMembers(
      conversationId,
      selected.map((u) => u.id),
    );
    if (problem) {
      setError(problem);
      setBusy(false);
    } else {
      onClose();
    }
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
        aria-labelledby="add-members-title"
        className="rise flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="add-members-title" className="font-display text-xl font-bold">
            Ajouter des participants
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

        <div className="space-y-3 px-5 pb-3">
          <label className="block">
            <span className="sr-only">Chercher une personne</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom ou nom d'utilisateur"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-line bg-bg px-4 placeholder:text-muted"
            />
          </label>
          {selected.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Personnes choisies">
              {selected.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => toggle(user)}
                    aria-label={`Retirer ${user.displayName}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand pl-3 pr-2 text-sm font-medium text-brand-ink"
                  >
                    {user.displayName}
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="scroll-thin min-h-24 flex-1 overflow-y-auto border-t border-line" aria-live="polite">
          {query.trim().length < 2 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">Tape au moins 2 lettres pour lancer la recherche.</p>
          ) : searching ? (
            <p className="px-5 py-6 text-center text-sm text-muted">Recherche en cours…</p>
          ) : results.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              Personne à ajouter pour « {query.trim()} ».
            </p>
          ) : (
            <ul>
              {results.map((user) => {
                const picked = selected.some((u) => u.id === user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      aria-pressed={picked}
                      onClick={() => toggle(user)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-bg focus-visible:bg-bg"
                    >
                      <Avatar id={user.id} name={user.displayName} avatarUrl={user.avatarUrl} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display font-semibold">{user.displayName}</span>
                        <span className="block truncate text-sm text-muted">@{user.username}</span>
                      </span>
                      {picked ? <Check size={18} className="text-brand" aria-label="Ajouté" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error ? (
          <p role="alert" className="border-t border-line px-5 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
          >
            {busy ? "Ajout en cours…" : selected.length > 0 ? `Ajouter (${selected.length})` : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
