"use client";

import { useEffect, useState } from "react";
import { Copy, Flag, Forward, Pencil, Pin, PinOff, Reply, Share2, Star, Trash2 } from "lucide-react";
import { REACTION_EMOJIS } from "@/lib/limits";
import type { ChatMessage } from "@/types/chat";

type MessageMenuProps = {
  message: ChatMessage;
  mine: boolean;
  canEdit: boolean;
  canDeleteForAll: boolean;
  myReaction: string | null;
  starred: boolean;
  /** Ce message est épinglé en haut de la discussion */
  pinned: boolean;
  /** Le navigateur sait partager du texte (menu de partage du téléphone) */
  canShare: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onShare: () => void;
  onToggleStar: () => void;
  onTogglePin: () => void;
  onReport: () => void;
  onForward: () => void;
  onEdit: () => void;
  onDelete: (scope: "me" | "all") => void;
};

const item =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-bg focus-visible:bg-bg";

/** Menu d'un message : réactions, répondre, copier, transférer, modifier, supprimer */
export default function MessageMenu(props: MessageMenuProps) {
  const { message, canEdit, canDeleteForAll, myReaction, onClose } = props;
  const [step, setStep] = useState<"main" | "delete">("main");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const deleted = message.deletedAt !== null;
  const hasText = message.type === "TEXT" && !!message.content;
  const canForward = !deleted && ["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE"].includes(message.type);

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
        aria-label="Options du message"
        className="rise w-full max-w-sm rounded-t-3xl bg-panel p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-2xl md:rounded-3xl"
      >
        {step === "main" ? (
          <>
            {!deleted ? (
              <div className="flex items-center justify-between px-1 py-2" role="group" aria-label="Réagir">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Réagir avec ${emoji}`}
                    aria-pressed={myReaction === emoji}
                    onClick={() => props.onReact(emoji)}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-[1.4rem] hover:bg-bg ${
                      myReaction === emoji ? "bg-bg ring-2 ring-accent" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="border-t border-line pt-1">
              {!deleted ? (
                <button type="button" className={item} onClick={props.onReply}>
                  <Reply size={19} aria-hidden="true" />
                  Répondre
                </button>
              ) : null}
              {hasText ? (
                <button type="button" className={item} onClick={props.onCopy}>
                  <Copy size={19} aria-hidden="true" />
                  Copier
                </button>
              ) : null}
              {!deleted && !["CALL", "SYSTEM"].includes(message.type) ? (
                <button type="button" className={item} onClick={props.onToggleStar}>
                  <Star size={19} aria-hidden="true" className={props.starred ? "fill-current" : ""} />
                  {props.starred ? "Retirer des favoris" : "Ajouter aux favoris"}
                </button>
              ) : null}
              {canForward ? (
                <button type="button" className={item} onClick={props.onTogglePin}>
                  {props.pinned ? <PinOff size={19} aria-hidden="true" /> : <Pin size={19} aria-hidden="true" />}
                  {props.pinned ? "Désépingler" : "Épingler"}
                </button>
              ) : null}
              {hasText && props.canShare ? (
                <button type="button" className={item} onClick={props.onShare}>
                  <Share2 size={19} aria-hidden="true" />
                  Partager
                </button>
              ) : null}
              {canForward ? (
                <button type="button" className={item} onClick={props.onForward}>
                  <Forward size={19} aria-hidden="true" />
                  Transférer
                </button>
              ) : null}
              {canEdit ? (
                <button type="button" className={item} onClick={props.onEdit}>
                  <Pencil size={19} aria-hidden="true" />
                  Modifier
                </button>
              ) : null}
              {!deleted && !props.mine && !["CALL", "SYSTEM"].includes(message.type) ? (
                <button type="button" className={`${item} text-danger`} onClick={props.onReport}>
                  <Flag size={19} aria-hidden="true" />
                  Signaler
                </button>
              ) : null}
              <button type="button" className={`${item} text-danger`} onClick={() => setStep("delete")}>
                <Trash2 size={19} aria-hidden="true" />
                Supprimer
              </button>
            </div>
          </>
        ) : (
          <div className="p-2">
            <p className="px-2 pb-2 pt-1 font-display text-lg font-semibold">Supprimer ce message ?</p>
            {canDeleteForAll ? (
              <button type="button" className={`${item} text-danger`} onClick={() => props.onDelete("all")}>
                Supprimer pour tous
              </button>
            ) : null}
            <button type="button" className={`${item} text-danger`} onClick={() => props.onDelete("me")}>
              Supprimer pour moi
            </button>
            <button type="button" className={item} onClick={onClose}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
