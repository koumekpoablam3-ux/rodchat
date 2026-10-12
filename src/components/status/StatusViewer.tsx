"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Send, Trash2, X } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { STATUS_BACKGROUNDS } from "@/lib/status-palette";
import type { StatusAuthor, StatusItem, StatusViewer as Viewer } from "@/types/status";
import Avatar from "../chat/Avatar";
import { useChat } from "../chat/ChatProvider";
import { statusTime } from "./time";

export type ViewerGroup = { user: StatusAuthor; items: StatusItem[]; mine: boolean };

type ViewerProps = {
  groups: ViewerGroup[];
  startGroup: number;
  onViewed: (statusId: string) => void;
  onChanged: () => void;
  onClose: () => void;
};

const DURATION_MS = 6000;
const TICK_MS = 50;

/** On commence au premier statut non vu d'une personne (ou au début s'ils sont tous vus) */
const firstUnseen = (group: ViewerGroup | undefined) => Math.max(0, group?.items.findIndex((i) => !i.viewed) ?? 0);

/** Lecteur plein écran : barres de progression, toucher à droite/gauche pour avancer/reculer, maintenir pour mettre en pause */
export default function StatusViewer({ groups, startGroup, onViewed, onChanged, onClose }: ViewerProps) {
  const [groupIndex, setGroupIndex] = useState(startGroup);
  const [itemIndex, setItemIndex] = useState(() => firstUnseen(groups[startGroup]));
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [sheet, setSheet] = useState<"viewers" | "delete" | null>(null);
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [error, setError] = useState("");
  const holdStart = useRef(0);
  const { conversations } = useChat();
  const [reply, setReply] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyNote, setReplyNote] = useState("");

  const group = groups[groupIndex];
  const item = group?.items[itemIndex];
  // En pause pendant la lecture d'un menu, un appui maintenu, ou l'écriture d'une réponse
  const paused = holding || sheet !== null || replyFocused;

  const goNext = useCallback(() => {
    setProgress(0);
    if (itemIndex < (group?.items.length ?? 0) - 1) return setItemIndex(itemIndex + 1);
    if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1);
      return setItemIndex(firstUnseen(groups[groupIndex + 1]));
    }
    onClose();
  }, [group, groupIndex, groups, itemIndex, onClose]);

  const goPrevious = useCallback(() => {
    setProgress(0);
    if (itemIndex > 0) return setItemIndex(itemIndex - 1);
    if (groupIndex > 0) {
      setGroupIndex(groupIndex - 1);
      return setItemIndex(groups[groupIndex - 1].items.length - 1);
    }
  }, [groupIndex, groups, itemIndex]);

  // La minuterie lit toujours la dernière version de goNext (sans relancer l'effet à chaque changement)
  const nextRef = useRef(goNext);
  nextRef.current = goNext;

  useEffect(() => {
    if (paused || !item) return;
    const timer = setInterval(() => setProgress((value) => Math.min(1, value + TICK_MS / DURATION_MS)), TICK_MS);
    return () => clearInterval(timer);
  }, [paused, item]);

  useEffect(() => {
    if (progress >= 1) nextRef.current();
  }, [progress]);

  // Un statut de quelqu'un d'autre s'affiche : l'auteur est prévenu qu'il a été vu
  const itemId = item?.id;
  const isMine = group?.mine ?? false;
  const alreadyViewed = item?.viewed ?? true;
  useEffect(() => {
    if (!itemId || isMine || alreadyViewed) return;
    fetch(`/api/statuses/${itemId}/view`, { method: "POST" }).catch(() => {});
    onViewed(itemId);
  }, [itemId, isMine, alreadyViewed, onViewed]);

  // Liste de ceux qui ont vu mon statut
  useEffect(() => {
    if (sheet !== "viewers" || !itemId) return;
    setViewers(null);
    let cancelled = false;
    fetch(`/api/statuses/${itemId}/views`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ viewers?: Viewer[] }>)
      .then((data) => {
        if (!cancelled) setViewers(data.viewers ?? []);
      })
      .catch(() => {
        if (!cancelled) setViewers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sheet, itemId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // En train d'écrire une réponse : les flèches déplacent le curseur, elles ne changent pas de statut
      if ((event.target as HTMLElement | null)?.tagName === "INPUT" && event.key !== "Escape") return;
      if (event.key === "Escape") return sheet ? setSheet(null) : onClose();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious, onClose, sheet]);

  function sendReply(event: React.FormEvent) {
    event.preventDefault();
    const text = reply.trim();
    if (!text || sending || !item || !group || group.mine) return;

    // Réponse = message dans la discussion à deux avec l'auteur du statut
    const conversation = conversations.find((c) => !c.isGroup && c.otherUserId === group.user.id);
    if (!conversation) return setReplyNote("Aucune discussion avec cette personne.");

    setSending(true);
    setReplyNote("");
    getSocket()
      .timeout(15_000)
      .emit(
        "message:send",
        { conversationId: conversation.id, content: text, clientId: crypto.randomUUID(), statusId: item.id },
        (error: Error | null, ack?: { ok?: boolean; error?: string }) => {
          setSending(false);
          if (error || !ack?.ok) {
            setReplyNote(ack?.error ?? "Envoi impossible. Réessaie.");
            return;
          }
          setReply("");
          setReplyFocused(false);
          (document.activeElement as HTMLElement | null)?.blur();
          setReplyNote("Réponse envoyée");
          setTimeout(() => setReplyNote(""), 2500);
        },
      );
  }

  async function remove() {
    if (!itemId) return;
    setError("");
    try {
      const response = await fetch(`/api/statuses/${itemId}`, { method: "DELETE" });
      if (!response.ok) return setError("Suppression impossible. Réessaie.");
      onChanged();
      onClose();
    } catch {
      setError("Pas de connexion. Réessaie.");
    }
  }

  if (!group || !item) return null;

  const palette = STATUS_BACKGROUNDS[item.background] ?? STATUS_BACKGROUNDS[0];
  const textSize = (item.text?.length ?? 0) < 60 ? "text-3xl" : (item.text?.length ?? 0) < 200 ? "text-2xl" : "text-xl";

  // Toucher bref = naviguer ; maintenir = pause (le relâchement ne navigue pas)
  const press = {
    onPointerDown: () => {
      holdStart.current = Date.now();
      setHolding(true);
    },
    onPointerUp: () => setHolding(false),
    onPointerCancel: () => setHolding(false),
    onPointerLeave: () => setHolding(false),
  };
  const tap = (action: () => void) => () => {
    if (Date.now() - holdStart.current < 250) action();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Statut de ${group.user.displayName}`}
      className="fixed inset-x-0 top-0 z-[60] flex select-none flex-col bg-black text-white"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      {/* Média */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={item.type === "TEXT" ? { background: `linear-gradient(160deg, ${palette.from}, ${palette.to})` } : undefined}
      >
        {item.type === "TEXT" ? (
          <p
            className={`max-w-full whitespace-pre-wrap break-words px-8 text-center font-display font-bold leading-snug ${textSize}`}
            style={{ color: palette.ink }}
          >
            {item.text}
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl ?? ""} alt="" className="h-full w-full object-contain" draggable={false} />
        )}
      </div>

      {/* Zones tactiles : gauche = précédent, droite = suivant */}
      <button type="button" aria-label="Statut précédent" className="absolute inset-y-0 left-0 w-1/3" {...press} onClick={tap(goPrevious)} />
      <button type="button" aria-label="Statut suivant" className="absolute inset-y-0 right-0 w-2/3" {...press} onClick={tap(goNext)} />

      {/* En-tête */}
      <div className="pointer-events-none relative bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="flex gap-1" aria-hidden="true">
          {group.items.map((entry, index) => (
            <span key={entry.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full bg-white"
                style={{ width: index < itemIndex ? "100%" : index === itemIndex ? `${progress * 100}%` : "0%" }}
              />
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Avatar id={group.user.id} name={group.user.displayName} avatarUrl={group.user.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-semibold">{group.mine ? "Mon statut" : group.user.displayName}</p>
            <p className="text-xs text-white/75">{statusTime(item.createdAt)}</p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="relative flex-1" />

      {/* Légende d'une photo */}
      {item.type === "IMAGE" && item.text ? (
        <p className="pointer-events-none relative bg-gradient-to-t from-black/70 to-transparent px-6 pb-4 pt-10 text-center text-[15px]">
          {item.text}
        </p>
      ) : null}

      {/* Mon statut : vues et suppression */}
      {group.mine ? (
        <div className="relative flex items-center justify-between bg-black/50 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          <button
            type="button"
            onClick={() => setSheet("viewers")}
            className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-white/15"
          >
            <Eye size={20} aria-hidden="true" />
            {item.viewCount ?? 0} vue{(item.viewCount ?? 0) > 1 ? "s" : ""}
          </button>
          <button
            type="button"
            aria-label="Supprimer ce statut"
            onClick={() => setSheet("delete")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/15"
          >
            <Trash2 size={20} />
          </button>
        </div>
      ) : (
        <form
          onSubmit={sendReply}
          className="relative bg-black/50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3"
        >
          {replyNote ? (
            <p role="status" className="mb-2 text-center text-xs font-medium text-white/80">
              {replyNote}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              value={reply}
              maxLength={2000}
              onChange={(event) => setReply(event.target.value)}
              onFocus={() => setReplyFocused(true)}
              onBlur={() => setReplyFocused(false)}
              placeholder={`Répondre à ${group.user.displayName.split(" ")[0]}…`}
              aria-label="Répondre à ce statut"
              className="h-11 min-w-0 flex-1 rounded-full bg-white/15 px-4 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            <button
              type="submit"
              disabled={!reply.trim() || sending}
              aria-label="Envoyer la réponse"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      )}

      {/* Feuilles du bas */}
      {sheet ? (
        <div
          className="absolute inset-0 z-10 flex items-end bg-black/40"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSheet(null);
          }}
        >
          <div className="rise max-h-[65%] w-full overflow-y-auto rounded-t-3xl bg-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-ink">
            {sheet === "viewers" ? (
              <>
                <h3 className="mb-3 font-display text-lg font-bold">Vu par</h3>
                {viewers === null ? (
                  <p className="text-sm text-muted">Chargement…</p>
                ) : viewers.length === 0 ? (
                  <p className="text-sm text-muted">Personne n&apos;a encore vu ce statut.</p>
                ) : (
                  <ul className="space-y-3">
                    {viewers.map((viewer) => (
                      <li key={viewer.user.id} className="flex items-center gap-3">
                        <Avatar id={viewer.user.id} name={viewer.user.displayName} avatarUrl={viewer.user.avatarUrl} size={40} />
                        <span className="min-w-0 flex-1 truncate font-medium">{viewer.user.displayName}</span>
                        <span className="text-xs text-muted">{statusTime(viewer.viewedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <h3 className="font-display text-lg font-bold">Supprimer ce statut ?</h3>
                <p className="mt-1 text-sm text-muted">Il disparaîtra pour tout le monde.</p>
                {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setSheet(null)} className="h-11 flex-1 rounded-xl border border-line font-semibold">
                    Annuler
                  </button>
                  <button type="button" onClick={() => void remove()} className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white">
                    Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
