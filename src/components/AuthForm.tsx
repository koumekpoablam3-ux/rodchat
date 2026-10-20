"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COUNTRIES, guessDial } from "@/lib/phone";

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
  const [dial, setDial] = useState("225");
  const [national, setNational] = useState("");
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
    // Pays proposé d'après le fuseau horaire de l'appareil (modifiable)
    setDial(guessDial(Intl.DateTimeFormat().resolvedOptions().timeZone));
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
          isRegister
            ? { displayName, dial, national, password, ...(inviteRequired ? { inviteCode } : {}) }
            : { username, password },
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
          {isRegister
            ? "Ton numéro de téléphone, un nom et un mot de passe suffisent."
            : "Connecte-toi avec ton numéro ou ton nom d'utilisateur."}
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

      {isRegister ? (
        <div className="auth-rise auth-rise-2">
          <label htmlFor="phone" className="mb-1 block text-sm font-medium">
            Numéro de téléphone
          </label>
          <div className="flex gap-2">
            <select
              aria-label="Pays"
              value={dial}
              onChange={(e) => setDial(e.target.value)}
              className="h-12 w-[7.5rem] shrink-0 rounded-xl border border-line bg-panel px-2 text-base shadow-sm"
            >
              {COUNTRIES.map((country) => (
                <option key={country.iso} value={country.dial}>
                  {country.iso} +{country.dial}
                </option>
              ))}
            </select>
            <input
              id="phone"
              className={inputClass}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={national}
              onChange={(e) => setNational(e.target.value)}
              placeholder="07 12 34 56 78"
              maxLength={25}
              required
              aria-describedby="phone-hint"
            />
          </div>
          <span id="phone-hint" className="mt-1 block text-sm text-muted">
            Ton numéro te sert à te connecter et à retrouver tes contacts. Les autres ne le voient jamais.
          </span>
        </div>
      ) : (
        <label className="auth-rise auth-rise-2 block">
          <span className="mb-1 block text-sm font-medium">Numéro ou nom d&apos;utilisateur</span>
          <input
            ref={firstField}
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            required
            aria-describedby="login-hint"
          />
          <span id="login-hint" className="mt-1 block text-sm text-muted">
            Avec un numéro, écris l&apos;indicatif : +225 07 12 34 56 78
          </span>
        </label>
      )}

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
          <p className="mt-2 text-sm">
            <Link href="/forgot-password" className="font-semibold text-brand underline">
              Mot de passe oublié ?
            </Link>
          </p>
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
