"use client";

import { useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/client-api";

const field = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px]";

/** Réglages « Compte et sécurité » : mot de passe, autres appareils, suppression du compte */
export default function AccountSecuritySection() {
  const [panel, setPanel] = useState<"password" | "delete" | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  function open(target: "password" | "delete" | null) {
    setPanel(target);
    setCurrent("");
    setNext("");
    setError("");
    setNote("");
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await apiRequest("/api/account/password", {
      method: "POST",
      json: { currentPassword: current, newPassword: next },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    open(null);
    setNote("Mot de passe changé. Tes autres appareils ont été déconnectés.");
  }

  async function signOutOthers() {
    setBusy(true);
    setError("");
    setNote("");
    const result = await apiRequest("/api/account/sessions", { method: "DELETE" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setNote("Tes autres appareils ont été déconnectés.");
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await apiRequest("/api/account", { method: "DELETE", json: { password: current } });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    window.location.href = "/login";
  }

  const link = "font-semibold text-brand underline";
  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Compte et sécurité</h3>

      {panel === null ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => open("password")}
            className="flex w-full items-center rounded-xl px-1 py-2.5 text-left font-medium hover:bg-bg"
          >
            Changer mon mot de passe
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOutOthers()}
            className="flex w-full flex-col rounded-xl px-1 py-2.5 text-left hover:bg-bg disabled:opacity-60"
          >
            <span className="font-medium">Déconnecter mes autres appareils</span>
            <span className="text-sm text-muted">Utile si tu as perdu un téléphone ou utilisé un ordinateur public.</span>
          </button>
          <button
            type="button"
            onClick={() => open("delete")}
            className="flex w-full items-center rounded-xl px-1 py-2.5 text-left font-medium text-danger hover:bg-bg"
          >
            Supprimer mon compte
          </button>
        </div>
      ) : panel === "password" ? (
        <form onSubmit={changePassword} className="space-y-3 py-2">
          <input
            className={field}
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe actuel"
            aria-label="Mot de passe actuel"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <input
            className={field}
            type="password"
            autoComplete="new-password"
            placeholder="Nouveau mot de passe (8 caractères minimum)"
            aria-label="Nouveau mot de passe"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => open(null)} className="h-11 flex-1 rounded-xl border border-line font-semibold">
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy || !current || next.length < 8}
              className="h-11 flex-1 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-50"
            >
              {busy ? "…" : "Changer"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={deleteAccount} className="space-y-3 rounded-xl bg-danger/10 p-3">
          <p className="text-sm font-medium">
            Cette action est <strong>définitive</strong> : ton profil, tes discussions à deux et tes messages seront
            effacés, et personne ne pourra les récupérer. Entre ton mot de passe pour confirmer.
          </p>
          <input
            className={field}
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe"
            aria-label="Mot de passe pour confirmer"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => open(null)} className="h-11 flex-1 rounded-xl border border-line bg-panel font-semibold">
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy || !current}
              className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white disabled:opacity-50"
            >
              {busy ? "…" : "Supprimer"}
            </button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm font-medium">
          {note}
        </p>
      ) : null}

      <p className="mt-3 text-sm text-muted">
        <Link href="/conditions" className={link}>
          Conditions d&apos;utilisation
        </Link>{" "}
        ·{" "}
        <Link href="/confidentialite" className={link}>
          Confidentialité
        </Link>
      </p>
    </section>
  );
}
