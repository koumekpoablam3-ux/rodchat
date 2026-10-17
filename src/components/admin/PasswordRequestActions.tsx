"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Approuver ou refuser une demande de nouveau mot de passe */
export default function PasswordRequestActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "approve" | "reject") {
    const question =
      action === "approve"
        ? `Approuver ? Le mot de passe choisi par ${name} remplacera l'ancien, et ses appareils seront déconnectés. Assure-toi que c'est bien cette personne.`
        : `Refuser la demande de ${name} ?`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/password-requests/${id}`, {
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
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("approve")}
          className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-50"
        >
          Approuver
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("reject")}
          className="h-10 rounded-xl border border-line px-4 text-sm font-semibold text-danger hover:bg-bg disabled:opacity-50"
        >
          Refuser
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
