"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { checkPin, LOCK_EVENT, readLock, removeLock, type LockConfig } from "@/lib/app-lock";
import { unbindPushSubscription } from "@/hooks/usePush";
import { LogoMark } from "./Logo";

const MAX_FAILS = 5;
const COOLDOWN_MS = 30_000;

/**
 * Écran de verrouillage : s'affiche au démarrage et quand on revient dans l'application après le délai choisi,
 * si un code a été défini dans les réglages. Tant qu'il est affiché, le reste de la page est masqué.
 */
export default function AppLock() {
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [forgot, setForgot] = useState(false);
  const fails = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cover = useCallback((on: boolean) => {
    if (on) document.documentElement.setAttribute("data-locked", "1");
    else document.documentElement.removeAttribute("data-locked");
  }, []);

  // Au chargement : un code existe ? alors on démarre verrouillé. Les changements de réglage sont suivis en direct.
  useEffect(() => {
    const initial = readLock();
    setConfig(initial);
    setLocked(Boolean(initial));
    cover(Boolean(initial));

    const onChange = () => {
      const next = readLock();
      setConfig(next);
      if (!next) {
        setLocked(false);
        cover(false);
      }
    };
    window.addEventListener(LOCK_EVENT, onChange);
    return () => window.removeEventListener(LOCK_EVENT, onChange);
  }, [cover]);

  // Retour dans l'application après le délai choisi : on verrouille
  useEffect(() => {
    if (!config) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const left = hiddenAt.current;
      hiddenAt.current = null;
      if (left === null || config.delaySec < 0) return;
      if ((Date.now() - left) / 1000 >= config.delaySec) {
        setPin("");
        setError("");
        setForgot(false);
        setLocked(true);
        cover(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [config, cover]);

  // Compte à rebours après trop d'essais ratés
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (locked) inputRef.current?.focus();
  }, [locked]);

  const submit = useCallback(
    async (value: string) => {
      if (busy || Date.now() < cooldownUntil) return;
      setBusy(true);
      const ok = await checkPin(value).catch(() => false);
      setBusy(false);
      if (ok) {
        fails.current = 0;
        setPin("");
        setError("");
        setLocked(false);
        cover(false);
        return;
      }
      fails.current += 1;
      setPin("");
      if (fails.current >= MAX_FAILS) {
        fails.current = 0;
        setCooldownUntil(Date.now() + COOLDOWN_MS);
        setNow(Date.now());
        setError("Trop d'essais. Patiente 30 secondes.");
      } else {
        setError("Code incorrect.");
      }
      inputRef.current?.focus();
    },
    [busy, cooldownUntil, cover],
  );

  async function signOut() {
    await unbindPushSubscription();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    removeLock(); // le code n'a plus de sens une fois déconnecté
    cover(false);
    window.location.href = "/login";
  }

  if (!config || !locked) return null;

  const waiting = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rodchat est verrouillé"
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-5 bg-bg px-6 text-center"
    >
      <LogoMark size={72} />
      <div>
        <h2 className="flex items-center justify-center gap-2 font-display text-2xl font-bold">
          <LockKeyhole size={22} aria-hidden="true" /> Rodchat est verrouillé
        </h2>
        <p className="mt-1 text-sm text-muted">Entre ton code pour continuer.</p>
      </div>

      <form
        className="flex w-full max-w-xs flex-col items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (pin.length >= 4) void submit(pin);
        }}
      >
        <input
          ref={inputRef}
          value={pin}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, "").slice(0, 6);
            setPin(value);
            setError("");
            // Dernier chiffre saisi : on valide tout seul
            if (value.length === config.length) void submit(value);
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          aria-label="Code de verrouillage"
          disabled={waiting > 0}
          className="h-14 w-full rounded-2xl border border-line bg-panel text-center text-2xl tracking-[0.5em] shadow-sm disabled:opacity-50"
        />
        <p role="alert" className="min-h-5 text-sm font-medium text-danger">
          {waiting > 0 ? `Trop d'essais. Réessaie dans ${waiting} s.` : error}
        </p>
        <button
          type="submit"
          disabled={busy || pin.length < 4 || waiting > 0}
          className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-50"
        >
          {busy ? "…" : "Déverrouiller"}
        </button>
      </form>

      {forgot ? (
        <div className="w-full max-w-xs rounded-2xl bg-panel p-4 text-sm shadow-sm">
          <p>
            Il n&apos;y a pas de récupération du code : il n&apos;existe que sur cet appareil. Tu peux te déconnecter, puis te
            reconnecter avec ton mot de passe (le code sera supprimé).
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setForgot(false)} className="h-10 flex-1 rounded-xl border border-line font-semibold">
              Retour
            </button>
            <button type="button" onClick={() => void signOut()} className="h-10 flex-1 rounded-xl bg-danger font-semibold text-white">
              Me déconnecter
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setForgot(true)} className="text-sm font-semibold text-brand underline">
          Code oublié ?
        </button>
      )}
    </div>
  );
}
