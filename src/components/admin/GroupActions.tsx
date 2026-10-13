"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Suppression d'un groupe, avec confirmation */
export default function GroupActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/groups/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError("Suppression impossible.");
    router.refresh();
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="h-10 rounded-xl border border-line px-3 text-sm font-semibold text-danger hover:bg-bg"
      >
        Supprimer
      </button>
    );
  }
  return (
    <div className="rounded-xl bg-danger/10 p-3">
      <p className="text-sm font-medium">
        Supprimer « {name} » et tous ses messages ? Les membres le verront disparaître. C&apos;est définitif.
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setConfirm(false)} className="h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold">
          Annuler
        </button>
        <button type="button" disabled={busy} onClick={() => void remove()} className="h-10 rounded-xl bg-danger px-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "…" : "Supprimer définitivement"}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
