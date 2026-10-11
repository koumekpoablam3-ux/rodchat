"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Mic, Paperclip, Pencil, SendHorizontal, Trash2, Video, X } from "lucide-react";
import { useVoiceRecorder, type VoiceRecording } from "@/hooks/useVoiceRecorder";
import { formatDuration } from "@/lib/format";
import { prepareImage } from "@/lib/image";
import { MAX_MESSAGE_LENGTH } from "@/lib/limits";
import type { ChatMessage } from "@/types/chat";
import { useChat } from "./ChatProvider";
import QuotedBlock from "./QuotedBlock";

type ComposerProps = {
  conversationId: string;
  onSent: () => void;
  /** Message auquel on répond (affiché au-dessus du champ) */
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  /** Message texte en cours de modification */
  editing: ChatMessage | null;
  onCancelEdit: () => void;
};

const menuItem =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-bg focus-visible:bg-bg";

export default function Composer({
  conversationId,
  onSent,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
}: ComposerProps) {
  const { me, sendMessage, sendAttachment, sendTyping, editMessage } = useChat();

  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingState = useRef<{ active: boolean; timer: ReturnType<typeof setTimeout> | null }>({
    active: false,
    timer: null,
  });

  async function sendVoice(recording: VoiceRecording) {
    const extension = recording.blob.type.includes("mp4") ? "m4a" : recording.blob.type.includes("ogg") ? "ogg" : "webm";
    const problem = await sendAttachment(conversationId, {
      blob: recording.blob,
      type: "AUDIO",
      fileName: `vocal.${extension}`,
      durationMs: recording.durationMs,
      replyTo,
    });
    if (problem) setError(problem);
    else {
      onSent();
      onCancelReply();
    }
  }

  const recorder = useVoiceRecorder((recording) => void sendVoice(recording));

  // Le champ de saisie grandit avec le texte (6 lignes au maximum)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [text, recorder.recording]);

  // Passage en mode modification : le texte du message revient dans le champ
  const editingId = editing?.id ?? null;
  const editingContent = editing?.content ?? "";
  useEffect(() => {
    if (editingId === null) return;
    setText(editingContent);
    textareaRef.current?.focus();
  }, [editingId, editingContent]);

  // Réponse : le curseur revient dans le champ
  const replyId = replyTo?.id ?? null;
  useEffect(() => {
    if (replyId !== null) textareaRef.current?.focus();
  }, [replyId]);

  // Message d'erreur qui disparaît tout seul
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  // Menu des pièces jointes : fermeture au clic ailleurs ou sur Échap
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Arrêt de l'indicateur « écrit… » en quittant la discussion
  useEffect(() => {
    const state = typingState.current;
    return () => {
      if (state.timer) clearTimeout(state.timer);
      if (state.active) sendTyping(conversationId, false);
    };
  }, [conversationId, sendTyping]);

  function stopTyping() {
    const state = typingState.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (state.active) {
      state.active = false;
      sendTyping(conversationId, false);
    }
  }

  function onChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setText(value);
    if (!value.trim()) return stopTyping();

    const state = typingState.current;
    if (!state.active) {
      state.active = true;
      sendTyping(conversationId, true);
    }
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(stopTyping, 2500);
  }

  async function submit() {
    const value = text.trim();
    if (!value) return;

    if (editing) {
      stopTyping();
      if (value === editing.content) {
        onCancelEdit();
        setText("");
        return;
      }
      const problem = await editMessage(conversationId, editing.id, value);
      if (problem) {
        setError(problem);
        return;
      }
      onCancelEdit();
      setText("");
      return;
    }

    sendMessage(conversationId, value, replyTo);
    onSent();
    onCancelReply();
    setText("");
    stopTyping();
    textareaRef.current?.focus();
  }

  function cancelEdit() {
    onCancelEdit();
    setText("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && (editing || replyTo)) {
      event.preventDefault();
      if (editing) cancelEdit();
      else onCancelReply();
      return;
    }
    // Sur ordinateur, Entrée envoie (Maj + Entrée = retour à la ligne). Sur téléphone, Entrée = retour à la ligne.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (event.key === "Enter" && !event.shiftKey && !touch && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>, kind: "IMAGE" | "VIDEO" | "FILE") {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // permet de choisir deux fois le même fichier
    setMenuOpen(false);

    for (const file of files) {
      let problem: string | null;
      if (kind === "IMAGE") {
        const image = await prepareImage(file);
        problem = await sendAttachment(conversationId, {
          blob: image.blob,
          type: "IMAGE",
          fileName: image.fileName,
          width: image.width,
          height: image.height,
          replyTo,
        });
      } else {
        problem = await sendAttachment(conversationId, { blob: file, type: kind, fileName: file.name, replyTo });
      }
      if (problem) setError(`${file.name} : ${problem}`);
      else {
        onSent();
        onCancelReply();
      }
    }
  }

  async function startRecording() {
    setMenuOpen(false);
    const problem = await recorder.start();
    if (problem) setError(problem);
  }

  async function finishRecording() {
    const recording = await recorder.stop();
    if (recording) await sendVoice(recording);
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="border-t border-line bg-panel px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 md:px-4">
      {error ? (
        <p role="alert" className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-bg px-3 py-2">
          <Pencil size={16} aria-hidden="true" className="shrink-0 text-brand" />
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">Modifier le message</span>
          </p>
          <button
            type="button"
            onClick={cancelEdit}
            aria-label="Annuler la modification"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-line"
          >
            <X size={18} />
          </button>
        </div>
      ) : replyTo ? (
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <QuotedBlock
              quoted={{
                id: replyTo.id,
                type: replyTo.type,
                content: replyTo.content,
                senderId: replyTo.senderId,
                deletedAt: replyTo.deletedAt,
                sender: { displayName: replyTo.sender?.displayName ?? "" },
                attachment: replyTo.attachment ? { fileName: replyTo.attachment.fileName } : null,
              }}
              meId={me.id}
              variant="composer"
            />
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Annuler la réponse"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-bg"
          >
            <X size={18} />
          </button>
        </div>
      ) : null}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void handleFiles(e, "IMAGE")}
      />
      <input ref={videoInput} type="file" accept="video/*" hidden onChange={(e) => void handleFiles(e, "VIDEO")} />
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => void handleFiles(e, "FILE")} />

      {recorder.recording ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={recorder.cancel}
            aria-label="Annuler l'enregistrement"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-danger hover:bg-bg"
          >
            <Trash2 size={20} />
          </button>
          <div
            role="status"
            aria-label="Enregistrement en cours"
            className="flex h-11 flex-1 items-center gap-3 rounded-2xl border border-line bg-bg px-4"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden="true" />
            <span className="font-medium tabular-nums">{formatDuration(recorder.elapsedMs)}</span>
            <span className="text-sm text-muted">Enregistrement…</span>
          </div>
          <button
            type="button"
            onClick={() => void finishRecording()}
            aria-label="Envoyer le message vocal"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"
          >
            <SendHorizontal size={20} />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex items-end gap-2"
        >
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Joindre un fichier"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-bg"
            >
              <Paperclip size={21} />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                aria-label="Type de fichier"
                className="rise absolute bottom-14 left-0 z-30 w-52 rounded-2xl border border-line bg-panel p-2 shadow-xl"
              >
                <button type="button" role="menuitem" className={menuItem} onClick={() => photoInput.current?.click()}>
                  <ImageIcon size={18} aria-hidden="true" />
                  Photos
                </button>
                <button type="button" role="menuitem" className={menuItem} onClick={() => videoInput.current?.click()}>
                  <Video size={18} aria-hidden="true" />
                  Vidéo
                </button>
                <button type="button" role="menuitem" className={menuItem} onClick={() => fileInput.current?.click()}>
                  <FileText size={18} aria-hidden="true" />
                  Document
                </button>
              </div>
            ) : null}
          </div>

          <label htmlFor="composer" className="sr-only">
            Écrire un message
          </label>
          <textarea
            id="composer"
            ref={textareaRef}
            rows={1}
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={editing ? "Modifie ton message" : "Écris un message"}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-[15px] leading-snug placeholder:text-muted"
          />

          {hasText ? (
            <button
              type="submit"
              aria-label="Envoyer le message"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"
            >
              <SendHorizontal size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording()}
              aria-label="Enregistrer un message vocal"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"
            >
              <Mic size={20} />
            </button>
          )}
        </form>
      )}
    </div>
  );
}
