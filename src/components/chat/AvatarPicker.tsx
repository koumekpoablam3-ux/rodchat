"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { prepareAvatar } from "@/lib/image";
import Avatar from "./Avatar";

type AvatarPickerProps = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isGroup?: boolean;
  size?: number;
  /** Reçoit la photo recadrée et réduite. Renvoie un message d'erreur, ou null. */
  onPick: (photo: Blob) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
};

/** Grande photo avec boutons pour la changer ou la retirer */
export default function AvatarPicker({ id, name, avatarUrl, isGroup, size = 112, onPick, onRemove }: AvatarPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError("");
    const problem = await action();
    if (problem) setError(problem);
    setBusy(false);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      const photo = await prepareAvatar(file);
      if (!photo) return "Impossible de lire cette image. Essaie une photo JPEG ou PNG.";
      return onPick(photo);
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar id={id} name={name} avatarUrl={avatarUrl} isGroup={isGroup} size={size} />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-label="Changer la photo"
          className="absolute -bottom-1 -right-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-brand-ink shadow-md ring-2 ring-panel disabled:opacity-60"
        >
          <Camera size={18} />
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
      </div>
      {avatarUrl ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(onRemove)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-danger disabled:opacity-60"
        >
          <Trash2 size={15} aria-hidden="true" />
          Supprimer la photo
        </button>
      ) : null}
      {busy ? (
        <p role="status" className="text-sm text-muted">
          Envoi de la photo…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-xs text-center text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
