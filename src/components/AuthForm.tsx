"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

const inputClass =
  "h-12 w-full rounded-xl border border-line bg-panel px-4 text-base shadow-sm transition-shadow placeholder:text-muted focus:shadow-md";

/** Page demandée avant la connexion (?next=), limitée aux pages de l'application */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
  return safe && (next.startsWith("/chat") || next.startsWith("/join/")) ? next : "/chat";
}

export default function AuthForm({ mode, inviteRequired = false }: { mode: Mode; inviteRequired?: boolean }) {
  const router = useRouter();
  // On garde la page demandée en passant de la connexion à l'inscription
  const [nextQuery, setNextQuery] = useState("");
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    setNextQuery(next ? `?next=${encodeURIComponent(next)}` : "");
    // Lien d'invitation : /register?code=XXXX remplit le champ tout seul
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setInviteCode(code);
  }, []);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  // Ordinateur : le curseur est déjà dans le premier champ. Téléphone : non, pour ne pas ouvrir le clavier tout de suite.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) firstField.current?.focus();
  }, []);

  const isRegister = mode === "register";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister ? { username, displayName, password, ...(inviteRequired ? { inviteCode } : {}) } : { username, password },
        ),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Une erreur est survenue. Réessaie.");
        setBusy(false);
        return;
      }
      router.replace(nextPath());
      router.refresh();
    } catch {
      setError("Connexion impossible. Vérifie ton réseau et réessaie.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-4" noValidate>
      <div className="auth-rise auth-rise-1">
        <h2 className="font-display text-3xl font-bold tracking-tight">
          {isRegister ? "Créer ton compte" : "Content de te revoir"}
        </h2>
        <p className="mt-1 text-muted">
          {isRegister ? "Il te faut juste un nom et un mot de passe." : "Connecte-toi pour retrouver tes discussions."}
        </p>
      </div>

      {isRegister ? (
        <label className="auth-rise auth-rise-2 block">
          <span className="mb-1 block text-sm font-medium">Ton nom</span>
          <input
            className={inputClass}
            ref={isRegister ? firstField : undefined}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            maxLength={40}
            required
          />
        </label>
      ) : null}

      <label className="auth-rise auth-rise-2 block">
        <span className="mb-1 block text-sm font-medium">Nom d&apos;utilisateur</span>
        <input
          ref={isRegister ? undefined : firstField}
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          required
          aria-describedby={isRegister ? "username-hint" : undefined}
        />
        {isRegister ? (
          <span id="username-hint" className="mt-1 block text-sm text-muted">
            3 à 20 caractères : lettres, chiffres ou _.
          </span>
        ) : null}
      </label>

      <div className="auth-rise auth-rise-3">
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Mot de passe
        </label>
        <div className="relative">
          <input
            id="password"
            className={`${inputClass} pr-12`}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLock(false)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            aria-describedby={isRegister ? "password-hint" : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={showPassword}
            className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {capsLock ? (
          <p role="status" className="mt-1 flex items-center gap-1.5 text-sm font-medium text-danger">
            <TriangleAlert size={15} aria-hidden="true" />
            Les majuscules sont verrouillées.
          </p>
        ) : null}
        {isRegister ? (
          <span id="password-hint" className="mt-1 block text-sm text-muted">
            8 caractères minimum.
          </span>
        ) : (
          <details className="mt-2 text-sm">
            <summary className="w-fit cursor-pointer font-semibold text-brand underline">Mot de passe oublié ?</summary>
            <p className="mt-1 rounded-xl bg-panel px-3 py-2 text-muted">
              Il n&apos;y a pas d&apos;envoi d&apos;e-mail : demande à l&apos;administrateur de Rodchat de réinitialiser ton
              mot de passe. Il te donnera un mot de passe temporaire que tu pourras changer ensuite dans les paramètres.
            </p>
          </details>
        )}
      </div>

      {isRegister && inviteRequired ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Code d&apos;invitation</span>
          <input
            className={inputClass}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={100}
            required
            aria-describedby="invite-hint"
          />
          <span id="invite-hint" className="mt-1 block text-sm text-muted">
            Demande-le à la personne qui t&apos;a invité(e).
          </span>
        </label>
      ) : null}

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
            Un instant…
          </span>
        ) : isRegister ? (
          "Créer mon compte"
        ) : (
          "Se connecter"
        )}
      </button>

      {isRegister ? (
        <p className="text-center text-xs text-muted">
          En créant un compte, tu acceptes les{" "}
          <Link href="/conditions" className="font-semibold underline">
            conditions d&apos;utilisation
          </Link>{" "}
          et la{" "}
          <Link href="/confidentialite" className="font-semibold underline">
            politique de confidentialité
          </Link>
          .
        </p>
      ) : null}

      <p className="text-center text-sm text-muted">
        {isRegister ? "Tu as déjà un compte ?" : "Pas encore de compte ?"}{" "}
        <Link href={`${isRegister ? "/login" : "/register"}${nextQuery}`} className="font-semibold text-brand underline">
          {isRegister ? "Se connecter" : "Créer un compte"}
        </Link>
      </p>
    </form>
  );
}
