"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, SendHorizontal, X } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { MAX_CAPTION_LENGTH } from "@/lib/limits";

type Kind = "IMAGE" | "VIDEO" | "FILE";

type Props = {
  files: File[];
  /** Type imposé par le bouton choisi (Photo, Vidéo, Document) ; sinon déduit du fichier */
  kind?: Kind;
  onCancel: () => void;
  onSend: (caption: string) => void;
};

const kindOf = (file: File, forced?: Kind): Kind =>
  forced ?? (file.type.startsWith("image/") ? "IMAGE" : file.type.startsWith("video/") ? "VIDEO" : "FILE");

/** Aperçu avant l'envoi d'une photo, d'une vidéo ou d'un document, avec une légende facultative */
export default function AttachmentPreview({ files, kind, onCancel, onSend }: Props) {
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const first = files[0];
  const firstKind = kindOf(first, kind);
  const others = files.length - 1;

  useEffect(() => {
    if (firstKind === "FILE") {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(first);
    setUrl(objectUrl);
    setBroken(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [first, firstKind]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Envoyer un fichier"
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-panel shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="font-display text-base font-semibold">
            {others > 0 ? `${files.length} fichiers` : firstKind === "IMAGE" ? "Photo" : firstKind === "VIDEO" ? "Vidéo" : "Document"}
          </h2>
          <button type="button" aria-label="Annuler" onClick={onCancel} className="rounded-full p-2 text-muted">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2 flex min-h-[10rem] flex-1 items-center justify-center overflow-hidden bg-black/5">
          {firstKind === "IMAGE" && url && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={first.name} onError={() => setBroken(true)} className="max-h-[50vh] w-full object-contain" />
          ) : firstKind === "VIDEO" && url ? (
            <video src={url} muted playsInline controls className="max-h-[50vh] w-full bg-black object-contain" />
          ) : (
            <div className="flex w-full items-center gap-3 p-6">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg">
                <FileText size={24} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{first.name}</span>
                <span className="block text-sm text-muted">{formatBytes(first.size)}</span>
              </span>
            </div>
          )}
        </div>

        {others > 0 ? (
          <p className="px-4 pt-2 text-sm text-muted">
            + {others} autre{others > 1 ? "s" : ""} fichier{others > 1 ? "s" : ""} (la légende va avec le premier)
          </p>
        ) : null}

        <form
          className="flex items-end gap-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
          onSubmit={(event) => {
            event.preventDefault();
            onSend(caption.trim());
          }}
        >
          <textarea
            ref={input}
            value={caption}
            onChange={(event) => setCaption(event.target.value.slice(0, MAX_CAPTION_LENGTH))}
            onKeyDown={(event) => {
              // Entrée envoie, Maj + Entrée passe à la ligne (comme dans la discussion)
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSend(caption.trim());
              }
            }}
            rows={1}
            maxLength={MAX_CAPTION_LENGTH}
            placeholder="Ajouter une légende…"
            aria-label="Légende"
            className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-[15px] placeholder:text-muted"
          />
          <button
            type="submit"
            aria-label="Envoyer"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink"
          >
            <SendHorizontal size={20} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
