"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { id: string; username: string; suspended: boolean; hasPhone?: boolean; phoneVerified?: boolean };

const btn = "h-10 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-bg disabled:opacity-50";

/** Actions d'administration sur un compte */
export default function UserActions({ id, username, suspended, hasPhone = false, phoneVerified = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"suspend" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  async function act(action: string, extra?: { reason?: string }) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; password?: string };
      if (!response.ok) return setError(data.error ?? "Action impossible.");
      if (data.password) setPassword(data.password);
      setMode(null);
      setReason("");
      setConfirm("");
      router.refresh();
    } catch {
      setError("Pas de connexion.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btn}>
        Gérer
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-bg p-3">
      <div className="flex flex-wrap gap-2">
        {suspended ? (
          <button type="button" disabled={busy} onClick={() => void act("unsuspend")} className={btn}>
            Réactiver
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => setMode(mode === "suspend" ? null : "suspend")} className={btn}>
            Suspendre
          </button>
        )}
        {hasPhone ? (
          phoneVerified ? (
            <button type="button" disabled={busy} onClick={() => void act("unverify-phone")} className={btn}>
              Retirer la vérification du numéro
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void act("verify-phone")} className={btn}>
              Marquer le numéro comme vérifié
            </button>
          )
        ) : null}
        <button type="button" disabled={busy} onClick={() => void act("logout")} className={btn}>
          Déconnecter ses appareils
        </button>
        <button type="button" disabled={busy} onClick={() => void act("reset-password")} className={btn}>
          Réinitialiser le mot de passe
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode(mode === "delete" ? null : "delete")}
          className={`${btn} text-danger`}
        >
          Supprimer le compte
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn}>
          Fermer
        </button>
      </div>

      {mode === "suspend" ? (
        <div className="flex gap-2">
          <input
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motif (facultatif)"
            aria-label="Motif de la suspension"
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 text-sm"
          />
          <button type="button" disabled={busy} onClick={() => void act("suspend", { reason })} className={`${btn} bg-danger text-white`}>
            Confirmer
          </button>
        </div>
      ) : null}

      {mode === "delete" ? (
        <div className="space-y-2 rounded-xl bg-danger/10 p-3">
          <p className="text-sm font-medium">
            Suppression <strong>définitive</strong> : profil, discussions à deux et messages de @{username}. Tape son nom
            d&apos;utilisateur pour confirmer.
          </p>
          <div className="flex gap-2">
            <input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={username}
              aria-label="Nom d'utilisateur à confirmer"
              autoCapitalize="none"
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy || confirm.trim().toLowerCase() !== username.toLowerCase()}
              onClick={() => void act("delete")}
              className={`${btn} bg-danger text-white`}
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : null}

      {password ? (
        <p role="status" className="rounded-xl bg-panel px-3 py-2 text-sm">
          Mot de passe temporaire (affiché une seule fois) :{" "}
          <code className="select-all rounded bg-bg px-1.5 py-0.5 font-mono font-bold">{password}</code>
          <br />
          Transmets-le à la personne : elle pourra le changer dans Paramètres → Compte et sécurité.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
