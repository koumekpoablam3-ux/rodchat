"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ContactRound, X } from "lucide-react";
import type { UserLite } from "@/types/chat";
import Avatar from "./Avatar";
import ContactsDialog from "./ContactsDialog";
import { useChat } from "./ChatProvider";

type Brief = Pick<UserLite, "id" | "username" | "displayName" | "avatarUrl">;
type Mode = "direct" | "group";

export default function NewChatDialog() {
  const { newChatOpen, setNewChatOpen } = useChat();
  if (!newChatOpen) return null;
  return <Dialog onClose={() => setNewChatOpen(false)} />;
}

function Dialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { openDirectChat, createGroup } = useChat();
  const [contactsOpen, setContactsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("direct");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Brief[]>([]);
  const [searching, setSearching] = useState(false);
  // Annuaire : toutes les personnes déjà inscrites, chargées à l'ouverture
  const [directory, setDirectory] = useState<Brief[] | null>(null);
  const [complete, setComplete] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<Brief[]>([]);
  const [groupName, setGroupName] = useState("");
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
    let cancelled = false;
    fetch("/api/users")
      .then((response) => response.json() as Promise<{ users?: Brief[]; complete?: boolean; hidden?: boolean }>)
      .then((data) => {
        if (cancelled) return;
        setDirectory(data.users ?? []);
        setComplete(data.complete !== false);
        setHidden(data.hidden === true);
      })
      .catch(() => {
        if (!cancelled) setDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Annuaire trop grand pour être chargé en entier : recherche côté serveur, avec un léger délai
  // pour ne pas interroger le serveur à chaque lettre
  useEffect(() => {
    const q = query.trim();
    if (complete || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/users?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { users?: Brief[] };
        setResults(response.ok ? (data.users ?? []) : []);
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
  }, [query, complete]);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      const id = await action();
      onClose();
      router.push(`/chat/${id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue. Réessaie.");
      setBusy(false);
    }
  }

  function toggle(user: Brief) {
    setSelected((current) =>
      current.some((u) => u.id === user.id) ? current.filter((u) => u.id !== user.id) : [...current, user],
    );
  }

  function submitGroup() {
    if (!groupName.trim()) return setError("Donne un nom au groupe.");
    if (selected.length === 0) return setError("Ajoute au moins un participant.");
    void run(() =>
      createGroup(
        groupName.trim(),
        selected.map((u) => u.id),
      ),
    );
  }

  const q = query.trim().toLowerCase();
  const useServer = !complete && q.length >= 2;
  const shown: Brief[] = useServer
    ? results
    : (directory ?? []).filter(
        (user) => !q || user.displayName.toLowerCase().includes(q) || user.username.includes(q),
      );
  const loadingList = useServer ? searching : directory === null;

  const tabClass = (active: boolean) =>
    `h-10 flex-1 rounded-lg text-sm font-semibold ${
      active ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"
    }`;

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
        aria-labelledby="new-chat-title"
        className="rise flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="new-chat-title" className="font-display text-xl font-bold">
            Nouvelle discussion
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

        <div className="px-5 pb-3">
          <div className="flex gap-1 rounded-xl bg-bg p-1" role="group" aria-label="Type de discussion">
            <button
              type="button"
              aria-pressed={mode === "direct"}
              className={tabClass(mode === "direct")}
              onClick={() => {
                setMode("direct");
                setError("");
              }}
            >
              Une personne
            </button>
            <button
              type="button"
              aria-pressed={mode === "group"}
              className={tabClass(mode === "group")}
              onClick={() => {
                setMode("group");
                setError("");
              }}
            >
              Un groupe
            </button>
          </div>
        </div>

        {mode === "direct" ? (
          <div className="px-5 pb-2">
            <button
              type="button"
              onClick={() => setContactsOpen(true)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold hover:bg-bg"
            >
              <ContactRound size={18} aria-hidden="true" /> Retrouver mes contacts
            </button>
          </div>
        ) : null}

        <div className="space-y-3 px-5 pb-3">
          {mode === "group" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nom du groupe</span>
              <input
                type="text"
                value={groupName}
                maxLength={60}
                onChange={(event) => setGroupName(event.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-bg px-4"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              {mode === "group" ? "Ajouter des participants" : "Chercher une personne"}
            </span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer par nom ou nom d'utilisateur"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-line bg-bg px-4 placeholder:text-muted"
            />
          </label>

          {mode === "group" && selected.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Participants choisis">
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
          {loadingList ? (
            <p className="px-5 py-6 text-center text-sm text-muted">Chargement des personnes…</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              {q
                ? `Personne ne correspond à « ${query.trim()} ». Vérifie l'orthographe.`
                : hidden
                  ? "La liste des inscrits est masquée. Utilise « Retrouver mes contacts », ou écris le nom d'utilisateur exact de la personne."
                  : "Personne d'autre n'est inscrit pour l'instant. Invite tes proches à créer un compte sur Rodchat."}
            </p>
          ) : (
            <ul>
              {!q && !useServer ? (
                <li className="px-5 pb-1 pt-3 font-display text-xs font-semibold uppercase tracking-wide text-muted">
                  Sur Rodchat · {shown.length} personne{shown.length > 1 ? "s" : ""}
                </li>
              ) : null}
              {shown.map((user) => {
                const picked = selected.some((u) => u.id === user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={mode === "group" ? picked : undefined}
                      onClick={() => (mode === "group" ? toggle(user) : void run(() => openDirectChat(user.id)))}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-bg focus-visible:bg-bg disabled:opacity-60"
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
              {!complete && q.length < 2 ? (
                <li className="px-5 py-3 text-center text-sm text-muted">
                  Tape au moins 2 lettres pour chercher parmi tout le monde.
                </li>
              ) : null}
            </ul>
          )}
        </div>

        {error ? (
          <p role="alert" className="border-t border-line px-5 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {mode === "group" ? (
          <div className="border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              type="button"
              disabled={busy}
              onClick={submitGroup}
              className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
            >
              {busy ? "Création en cours…" : "Créer le groupe"}
            </button>
          </div>
        ) : null}
      </div>
      {contactsOpen ? <ContactsDialog onClose={() => setContactsOpen(false)} /> : null}
    </div>
  );
}
