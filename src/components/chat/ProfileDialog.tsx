"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { MAX_ABOUT, MAX_DISPLAY_NAME } from "@/lib/limits";
import AvatarPicker from "./AvatarPicker";
import { useChat } from "./ChatProvider";

/** Mon profil : photo, nom et info */
export default function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { me, updateProfile, setMyAvatar } = useChat();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [about, setAbout] = useState(me.about ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function save() {
    if (!displayName.trim()) return setError("Le nom ne peut pas être vide.");
    setBusy(true);
    setError("");
    const problem = await updateProfile({ displayName: displayName.trim(), about: about.trim() });
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  }

  const field = "h-11 w-full rounded-xl border border-line bg-bg px-4";

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
        aria-labelledby="profile-title"
        className="rise flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="profile-title" className="font-display text-xl font-bold">
            Mon profil
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

        <div className="scroll-thin space-y-4 overflow-y-auto px-5 py-3">
          <AvatarPicker
            id={me.id}
            name={me.displayName}
            avatarUrl={me.avatarUrl}
            onPick={(photo) => setMyAvatar(photo)}
            onRemove={() => setMyAvatar(null)}
          />

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Nom affiché</span>
            <input
              type="text"
              value={displayName}
              maxLength={MAX_DISPLAY_NAME}
              onChange={(event) => setDisplayName(event.target.value)}
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Info</span>
            <input
              type="text"
              value={about}
              maxLength={MAX_ABOUT}
              placeholder="Disponible"
              onChange={(event) => setAbout(event.target.value)}
              className={`${field} placeholder:text-muted`}
            />
            <span className="mt-1 block text-xs text-muted">Visible par tes contacts.</span>
          </label>

          <p className="text-sm text-muted">Nom d&apos;utilisateur : @{me.username}</p>
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
            onClick={() => void save()}
            className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
