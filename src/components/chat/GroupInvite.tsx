"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, RefreshCw, Share2, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/client-api";

const row =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-bg focus-visible:bg-bg disabled:opacity-60";

/** Lien d'invitation d'un groupe : créer, copier, partager, remplacer, révoquer (administrateurs) */
export default function GroupInvite({ conversationId }: { conversationId: string }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ token: string | null }>(`/api/conversations/${conversationId}/invite`).then((result) => {
      if (cancelled) return;
      if (result.ok) setToken(result.data.token);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const link = token ? `${window.location.origin}/join/${token}` : "";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function call(method: "POST" | "DELETE", done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await apiRequest<{ token: string | null }>(`/api/conversations/${conversationId}/invite`, { method });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setToken(result.data.token);
    setMessage(done);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Lien copié");
      setError("");
    } catch {
      setError("Impossible de copier le lien. Sélectionne-le et copie-le à la main.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Rejoindre le groupe sur Rodchat", url: link });
    } catch {
      /* partage annulé */
    }
  }

  return (
    <div className="border-t border-line pt-3">
      <h3 className="mb-1 px-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Lien d&apos;invitation
      </h3>

      {token === undefined && !error ? <p className="px-3 py-2 text-sm text-muted">Chargement…</p> : null}

      {token === null ? (
        <button type="button" className={row} disabled={busy} onClick={() => void call("POST", "Lien créé")}>
          <Link2 size={20} aria-hidden="true" />
          Créer un lien d&apos;invitation
        </button>
      ) : null}

      {token ? (
        <>
          <input
            type="text"
            readOnly
            value={link}
            aria-label="Lien d'invitation"
            onFocus={(event) => event.target.select()}
            className="mx-3 mb-1 h-10 w-[calc(100%-1.5rem)] rounded-xl border border-line bg-bg px-3 text-sm"
          />
          <p className="px-3 pb-1 text-xs text-muted">
            Toute personne qui a ce lien et un compte Rodchat peut rejoindre le groupe.
          </p>
          <button type="button" className={row} onClick={() => void copy()}>
            <Copy size={20} aria-hidden="true" />
            Copier le lien
          </button>
          {canShare ? (
            <button type="button" className={row} onClick={() => void share()}>
              <Share2 size={20} aria-hidden="true" />
              Partager le lien
            </button>
          ) : null}
          <button type="button" className={row} disabled={busy} onClick={() => void call("POST", "Nouveau lien créé, l'ancien ne fonctionne plus")}>
            <RefreshCw size={20} aria-hidden="true" />
            Réinitialiser le lien
          </button>
          <button type="button" className={`${row} text-danger`} disabled={busy} onClick={() => void call("DELETE", "Lien révoqué")}>
            <Trash2 size={20} aria-hidden="true" />
            Révoquer le lien
          </button>
        </>
      ) : null}

      {message ? (
        <p role="status" className="px-3 pt-1 text-sm font-medium text-brand">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-3 pt-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
