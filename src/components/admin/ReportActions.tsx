"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { id: string; hasMessage: boolean; canSuspend: boolean };

const btn = "h-10 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-bg disabled:opacity-50";

/** Traiter un signalement : le classer, supprimer le message, suspendre la personne */
export default function ReportActions({ id, hasMessage, canSuspend }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "resolve" | "delete-message" | "suspend-user") {
    if (action === "suspend-user" && !window.confirm("Suspendre cette personne ? Elle ne pourra plus se connecter.")) return;
    if (action === "delete-message" && !window.confirm("Supprimer ce message pour tout le monde ?")) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/reports/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      return setError(data?.error ?? "Action impossible.");
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void act("resolve")} className={`${btn} bg-brand text-brand-ink`}>
          Marquer comme traité
        </button>
        {hasMessage ? (
          <button type="button" disabled={busy} onClick={() => void act("delete-message")} className={btn}>
            Supprimer le message
          </button>
        ) : null}
        {canSuspend ? (
          <button type="button" disabled={busy} onClick={() => void act("suspend-user")} className={`${btn} text-danger`}>
            Suspendre la personne
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
