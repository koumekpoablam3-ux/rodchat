"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

const inputClass =
  "h-12 w-full rounded-xl border border-line bg-panel px-4 text-base placeholder:text-muted";

/** Page demandée avant la connexion (?next=), limitée aux pages de l'application */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
  return safe && (next.startsWith("/chat") || next.startsWith("/join/")) ? next : "/chat";
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  // On garde la page demandée en passant de la connexion à l'inscription
  const [nextQuery, setNextQuery] = useState("");
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    setNextQuery(next ? `?next=${encodeURIComponent(next)}` : "");
  }, []);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRegister ? { username, displayName, password } : { username, password }),
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
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">
          {isRegister ? "Créer ton compte" : "Content de te revoir"}
        </h2>
        <p className="mt-1 text-muted">
          {isRegister ? "Il te faut juste un nom et un mot de passe." : "Connecte-toi pour retrouver tes discussions."}
        </p>
      </div>

      {isRegister ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Ton nom</span>
          <input
            className={inputClass}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            maxLength={40}
            required
          />
        </label>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Nom d&apos;utilisateur</span>
        <input
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

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Mot de passe</span>
        <input
          className={inputClass}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          aria-describedby={isRegister ? "password-hint" : undefined}
        />
        {isRegister ? (
          <span id="password-hint" className="mt-1 block text-sm text-muted">
            8 caractères minimum.
          </span>
        ) : null}
      </label>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
      >
        {busy ? "Un instant…" : isRegister ? "Créer mon compte" : "Se connecter"}
      </button>

      <p className="text-center text-sm text-muted">
        {isRegister ? "Tu as déjà un compte ?" : "Pas encore de compte ?"}{" "}
        <Link href={`${isRegister ? "/login" : "/register"}${nextQuery}`} className="font-semibold text-brand underline">
          {isRegister ? "Se connecter" : "Créer un compte"}
        </Link>
      </p>
    </form>
  );
}
