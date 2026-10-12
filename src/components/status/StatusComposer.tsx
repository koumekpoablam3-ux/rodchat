"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Type, X } from "lucide-react";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/limits";
import { MAX_STATUS_CAPTION, MAX_STATUS_TEXT, STATUS_BACKGROUNDS } from "@/lib/status-palette";

type ComposerProps = { onClose: () => void; onPublished: () => void };

/** Création d'un statut : un texte sur fond coloré, ou une photo avec légende */
export default function StatusComposer({ onClose, onPublished }: ComposerProps) {
  const [mode, setMode] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [background, setBackground] = useState(0);
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const palette = STATUS_BACKGROUNDS[background];

  // L'aperçu de la photo est libéré quand on en change ou qu'on ferme
  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Choisis une image.");
    try {
      const prepared = await prepareImage(file);
      if (prepared.blob.size > MAX_UPLOAD_BYTES) return setError(`Cette photo dépasse ${MAX_UPLOAD_MB} Mo.`);
      setPhoto(prepared);
    } catch {
      setError("Impossible de lire cette photo.");
    }
  }

  const canPublish = !busy && (mode === "text" ? text.trim().length > 0 : photo !== null);

  async function publish() {
    if (!canPublish) return;
    setBusy(true);
    setError("");
    try {
      const response =
        mode === "text"
          ? await fetch("/api/statuses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: text.trim(), background }),
            })
          : await fetch("/api/statuses", {
              method: "POST",
              headers: {
                "Content-Type": photo?.blob.type || "image/jpeg",
                "x-width": String(photo?.width ?? ""),
                "x-height": String(photo?.height ?? ""),
                "x-caption": encodeURIComponent(caption.trim()),
              },
              body: photo?.blob,
            });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Publication impossible. Réessaie.");
        return;
      }
      onPublished();
    } catch {
      setError("Pas de connexion. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (active: boolean) =>
    `inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
      active ? "bg-white/25 text-white" : "text-white/70 hover:bg-white/10"
    }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nouveau statut"
      className="fixed inset-0 z-[55] flex flex-col text-white"
      style={{
        background:
          mode === "text" ? `linear-gradient(160deg, ${palette.from}, ${palette.to})` : "#000",
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X size={22} />
        </button>
        <div className="flex gap-1">
          <button type="button" className={tab(mode === "text")} onClick={() => setMode("text")}>
            <Type size={18} aria-hidden="true" /> Texte
          </button>
          <button type="button" className={tab(mode === "photo")} onClick={() => setMode("photo")}>
            <ImagePlus size={18} aria-hidden="true" /> Photo
          </button>
        </div>
        <button
          type="button"
          disabled={!canPublish}
          onClick={() => void publish()}
          className="h-10 rounded-full bg-white px-5 text-sm font-bold text-black disabled:opacity-40"
        >
          {busy ? "Envoi…" : "Publier"}
        </button>
      </div>

      {mode === "text" ? (
        <>
          <div className="flex flex-1 items-center justify-center px-6">
            <textarea
              autoFocus
              value={text}
              maxLength={MAX_STATUS_TEXT}
              onChange={(event) => setText(event.target.value)}
              placeholder="Écris un statut"
              aria-label="Texte du statut"
              rows={5}
              className="w-full resize-none bg-transparent text-center font-display text-2xl font-bold leading-snug placeholder:opacity-60 focus:outline-none"
              style={{ color: palette.ink }}
            />
          </div>
          <div className="flex items-center justify-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {STATUS_BACKGROUNDS.map((item, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Couleur ${index + 1}`}
                aria-pressed={index === background}
                onClick={() => setBackground(index)}
                className={`h-8 w-8 rounded-full border-2 ${index === background ? "border-white" : "border-white/30"}`}
                style={{ background: `linear-gradient(160deg, ${item.from}, ${item.to})` }}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center px-3">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Aperçu du statut" className="max-h-full max-w-full rounded-xl object-contain" />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-white/30 px-10 py-12 text-white/80 hover:bg-white/5"
              >
                <ImagePlus size={36} aria-hidden="true" />
                <span className="font-semibold">Choisir une photo</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
            {previewUrl ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-11 shrink-0 rounded-xl bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
              >
                Changer
              </button>
            ) : null}
            <input
              value={caption}
              maxLength={MAX_STATUS_CAPTION}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Ajouter une légende"
              aria-label="Légende"
              className="h-11 min-w-0 flex-1 rounded-xl bg-white/15 px-4 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={choosePhoto} />
        </>
      )}

      {error ? (
        <p role="alert" className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+4.5rem)] rounded-xl bg-danger px-4 py-2 text-center text-sm font-medium text-white">
          {error}
        </p>
      ) : null}
    </div>
  );
}
