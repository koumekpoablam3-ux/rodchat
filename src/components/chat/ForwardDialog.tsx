"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { MAX_FORWARD_TARGETS } from "@/lib/limits";
import Avatar from "./Avatar";
import { useChat } from "./ChatProvider";

type ForwardDialogProps = {
  /** Un ou plusieurs messages, transférés dans l'ordre */
  messageIds: string[];
  onClose: () => void;
  /** Appelé après un transfert réussi */
  onDone: (count: number) => void;
};

/** Choix des discussions où transférer un message */
export default function ForwardDialog({ messageIds, onClose, onDone }: ForwardDialogProps) {
  const { conversations, forwardMessage } = useChat();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? conversations.filter((c) => c.name.toLowerCase().includes(q)) : conversations;
  }, [conversations, filter]);

  function toggle(id: string) {
    setError("");
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= MAX_FORWARD_TARGETS) {
        setError(`Tu peux choisir ${MAX_FORWARD_TARGETS} discussions au maximum.`);
        return current;
      }
      return [...current, id];
    });
  }

  async function send() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    for (const messageId of messageIds) {
      const problem = await forwardMessage(messageId, selected);
      if (problem) {
        setError(problem);
        setBusy(false);
        return;
      }
    }
    onDone(selected.length);
  }

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
        aria-labelledby="forward-title"
        className="rise flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="forward-title" className="font-display text-xl font-bold">
            {messageIds.length > 1 ? `Transférer ${messageIds.length} messages à…` : "Transférer à…"}
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
          <label className="block">
            <span className="sr-only">Chercher une discussion</span>
            <input
              type="search"
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Chercher une discussion"
              className="h-11 w-full rounded-xl border border-line bg-bg px-4 placeholder:text-muted"
            />
          </label>
        </div>

        <ul className="scroll-thin min-h-24 flex-1 overflow-y-auto border-t border-line">
          {visible.length === 0 ? (
            <li className="px-5 py-6 text-center text-sm text-muted">Aucune discussion ne correspond.</li>
          ) : (
            visible.map((conversation) => {
              const picked = selected.includes(conversation.id);
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggle(conversation.id)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-bg focus-visible:bg-bg"
                  >
                    <Avatar
                      id={conversation.otherUserId ?? conversation.id}
                      name={conversation.name}
                      avatarUrl={conversation.avatarUrl}
                      isGroup={conversation.isGroup}
                      size={40}
                    />
                    <span className="min-w-0 flex-1 truncate font-display font-semibold">{conversation.name}</span>
                    {picked ? <Check size={18} className="text-brand" aria-label="Choisie" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {error ? (
          <p role="alert" className="border-t border-line px-5 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <button
            type="button"
            disabled={busy || selected.length === 0}
            onClick={() => void send()}
            className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
          >
            {busy ? "Envoi…" : selected.length > 0 ? `Transférer (${selected.length})` : "Transférer"}
          </button>
        </div>
      </div>
    </div>
  );
}
