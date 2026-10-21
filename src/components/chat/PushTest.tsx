"use client";

import { useState } from "react";

/** Envoie une vraie notification à cet appareil, et dit précisément ce qui manque si elle n'arrive pas */
export default function PushTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string; devices?: number };
      if (response.ok) {
        setResult({
          ok: true,
          text: "Notification envoyée. Si rien n'apparaît dans quelques secondes, vérifie les réglages de notification de ton système (mode Ne pas déranger, navigateur bloqué).",
        });
      } else {
        setResult({ ok: false, text: data.error ?? "L'envoi a échoué." });
      }
    } catch {
      setResult({ ok: false, text: "Pas de connexion au serveur." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy}
        className="rounded-full border border-line px-4 py-1.5 text-sm font-medium disabled:opacity-60"
      >
        {busy ? "Envoi…" : "Envoyer une notification de test"}
      </button>
      {result ? (
        <p role="status" className={`mt-2 text-sm ${result.ok ? "text-muted" : "text-danger"}`}>
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
