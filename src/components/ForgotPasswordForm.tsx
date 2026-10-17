"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";

const inputClass =
  "h-12 w-full rounded-xl border border-line bg-panel px-4 text-base shadow-sm transition-shadow placeholder:text-muted focus:shadow-md";

/** Mot de passe oublié : on choisit un nouveau mot de passe et on envoie la demande à l'administrateur */
export default function ForgotPasswordForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [proof, setProof] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError("Le mot de passe doit faire au moins 8 caractères.");
    if (password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, newPassword: password, proof }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) return setError(data.error ?? "Envoi impossible. Réessaie.");
      setSent(true);
    } catch {
      setError("Connexion impossible. Vérifie ton réseau et réessaie.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-rise w-full space-y-4">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-panel text-brand shadow-sm">
          <MailCheck size={28} aria-hidden="true" />
        </span>
        <h2 className="font-display text-3xl font-bold tracking-tight">Demande envoyée</h2>
        <p className="text-muted">
          L&apos;administrateur va vérifier que c&apos;est bien toi, puis valider ta demande. Une fois qu&apos;il l&apos;a fait,
          connecte-toi avec <strong className="text-ink">le nouveau mot de passe que tu viens de choisir</strong>.
        </p>
        <p className="rounded-xl bg-panel px-4 py-3 text-sm text-muted">
          Tant que ce n&apos;est pas validé, ton ancien mot de passe reste en vigueur. Pour aller plus vite, préviens
          l&apos;administrateur par un autre moyen.
        </p>
        <Link href="/login" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand font-semibold text-brand-ink shadow-md">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-4" noValidate>
      <div className="auth-rise auth-rise-1">
        <h2 className="font-display text-3xl font-bold tracking-tight">Mot de passe oublié</h2>
        <p className="mt-1 text-muted">Choisis un nouveau mot de passe : il s&apos;appliquera quand l&apos;administrateur l&apos;aura validé.</p>
      </div>

      <label className="auth-rise auth-rise-2 block">
        <span className="mb-1 block text-sm font-medium">Nom d&apos;utilisateur</span>
        <input
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </label>

      <div className="auth-rise auth-rise-3 space-y-4">
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <input
              id="new-password"
              className={`${inputClass} pr-12`}
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              aria-describedby="new-password-hint"
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? "Masquer les mots de passe" : "Afficher les mots de passe"}
              aria-pressed={show}
              className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink"
            >
              {show ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <span id="new-password-hint" className="mt-1 block text-sm text-muted">
            8 caractères minimum.
          </span>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Confirme le nouveau mot de passe</span>
          <input
            className={inputClass}
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Comment l&apos;administrateur peut-il t&apos;identifier ?</span>
          <textarea
            className="w-full resize-none rounded-xl border border-line bg-panel px-4 py-3 text-base shadow-sm placeholder:text-muted"
            rows={3}
            maxLength={300}
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder="Ton nom, ton numéro de téléphone, ou un détail que seul toi connais"
            required
          />
          <span className="mt-1 block text-sm text-muted">
            L&apos;administrateur lira ce texte pour s&apos;assurer que c&apos;est bien toi avant de valider.
          </span>
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink shadow-md transition-transform hover:-translate-y-px active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {busy ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            Envoi…
          </span>
        ) : (
          "Envoyer la demande"
        )}
      </button>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-semibold text-brand underline">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
