"use client";

import { useEffect } from "react";
import { Archive, ArchiveRestore, Bell, BellOff, CircleDot, MailOpen, Pin, PinOff } from "lucide-react";
import { isMuted } from "@/lib/conversation-sort";
import type { ConversationSummary } from "@/types/chat";

type ConversationRowMenuProps = {
  conversation: ConversationSummary;
  onClose: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  /** Marque comme non lue, ou comme lue si elle l'est déjà (messages non lus ou marque) */
  onToggleUnread: () => void;
  /** Ouvre le choix de durée, ou réactive le son */
  onToggleMute: () => void;
};

const item =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-bg focus-visible:bg-bg";

/** Menu d'une discussion de la liste : épingler, archiver, sourdine */
export default function ConversationRowMenu({
  conversation,
  onClose,
  onTogglePin,
  onToggleArchive,
  onToggleUnread,
  onToggleMute,
}: ConversationRowMenuProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const pinned = conversation.pinnedAt !== null;
  const archived = conversation.archivedAt !== null;
  const muted = isMuted(conversation.mutedUntil);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Options de ${conversation.name}`}
        className="rise w-full max-w-xs rounded-t-3xl bg-panel p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-2xl md:rounded-3xl"
      >
        <p className="truncate px-3 pb-1 pt-2 font-display font-semibold">{conversation.name}</p>
        <button type="button" className={item} onClick={onTogglePin}>
          {pinned ? <PinOff size={19} aria-hidden="true" /> : <Pin size={19} aria-hidden="true" />}
          {pinned ? "Désépingler" : "Épingler"}
        </button>
        <button type="button" className={item} onClick={onToggleArchive}>
          {archived ? <ArchiveRestore size={19} aria-hidden="true" /> : <Archive size={19} aria-hidden="true" />}
          {archived ? "Désarchiver" : "Archiver"}
        </button>
        <button type="button" className={item} onClick={onToggleUnread}>
          {conversation.unreadCount > 0 || conversation.markedUnread ? (
            <MailOpen size={19} aria-hidden="true" />
          ) : (
            <CircleDot size={19} aria-hidden="true" />
          )}
          {conversation.unreadCount > 0 || conversation.markedUnread ? "Marquer comme lue" : "Marquer comme non lue"}
        </button>
        <button type="button" className={item} onClick={onToggleMute}>
          {muted ? <Bell size={19} aria-hidden="true" /> : <BellOff size={19} aria-hidden="true" />}
          {muted ? "Réactiver le son" : "Mettre en sourdine"}
        </button>
      </div>
    </div>
  );
}
