"use client";

import { useEffect, useState } from "react";
import { checkPin, isValidPin, LOCK_EVENT, readLock, removeLock, setLockDelay, setPin, type LockConfig } from "@/lib/app-lock";

const DELAYS = [
  { value: 0, label: "Dès que je quitte l'application" },
  { value: 60, label: "Après 1 minute" },
  { value: 300, label: "Après 5 minutes" },
  { value: -1, label: "Au démarrage seulement" },
];

const field = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-center text-lg tracking-[0.4em]";

/** Réglages « Verrouillage de l'application » : code, délai, suppression */
export default function AppLockSection() {
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [panel, setPanel] = useState<"set" | "change" | "remove" | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const load = () => setConfig(readLock());
    load();
    window.addEventListener(LOCK_EVENT, load);
    return () => window.removeEventListener(LOCK_EVENT, load);
  }, []);

  function open(target: typeof panel) {
    setPanel(target);
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
    setNote("");
  }

  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (panel === "change" && !(await checkPin(current))) return setError("Le code actuel est incorrect.");
    if (!isValidPin(next)) return setError("Le code doit faire 4 à 6 chiffres.");
    if (next !== confirm) return setError("Les deux codes ne sont pas identiques.");
    setBusy(true);
    await setPin(next, config?.delaySec ?? 0);
    setBusy(false);
    open(null);
    setNote("Code enregistré. L'application se verrouillera selon le délai choisi.");
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!(await checkPin(current))) return setError("Code incorrect.");
    removeLock();
    open(null);
    setNote("Verrouillage désactivé.");
  }

  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Verrouillage de l&apos;application</h3>
      <p className="mb-2 text-sm text-muted">
        Un code de 4 à 6 chiffres masque Rodchat quand tu la quittes : utile si quelqu&apos;un prend ton téléphone ouvert. Il
        reste sur cet appareil et ne se récupère pas : si tu l&apos;oublies, tu te déconnectes puis te reconnectes.
      </p>

      {panel === null ? (
        config ? (
          <div className="space-y-3">
            <div role="radiogroup" aria-label="Quand verrouiller" className="space-y-1">
              {DELAYS.map((delay) => (
                <label key={delay.value} className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 hover:bg-bg">
                  <input
                    type="radio"
                    name="lock-delay"
                    checked={config.delaySec === delay.value}
                    onChange={() => setLockDelay(delay.value)}
                    className="h-4 w-4"
                  />
                  <span className="text-[15px]">{delay.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => open("change")} className="h-10 flex-1 rounded-xl border border-line text-sm font-semibold hover:bg-bg">
                Changer le code
              </button>
              <button type="button" onClick={() => open("remove")} className="h-10 flex-1 rounded-xl border border-line text-sm font-semibold text-danger hover:bg-bg">
                Désactiver
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => open("set")} className="h-11 w-full rounded-xl border border-line font-semibold hover:bg-bg">
            Définir un code
          </button>
        )
      ) : panel === "remove" ? (
        <form onSubmit={remove} className="space-y-3 py-1">
          <input
            className={field}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Code actuel"
            placeholder="Code actuel"
            value={current}
            onChange={(e) => setCurrent(digits(e.target.value))}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => open(null)} className="h-11 flex-1 rounded-xl border border-line font-semibold">
              Annuler
            </button>
            <button type="submit" disabled={current.length < 4} className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white disabled:opacity-50">
              Désactiver
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={save} className="space-y-3 py-1">
          {panel === "change" ? (
            <input className={field} type="password" inputMode="numeric" autoComplete="off" aria-label="Code actuel" placeholder="Code actuel" value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
          ) : null}
          <input className={field} type="password" inputMode="numeric" autoComplete="off" aria-label="Nouveau code" placeholder="Nouveau code" value={next} onChange={(e) => setNext(digits(e.target.value))} />
          <input className={field} type="password" inputMode="numeric" autoComplete="off" aria-label="Confirmer le code" placeholder="Confirmer le code" value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} />
          <div className="flex gap-2">
            <button type="button" onClick={() => open(null)} className="h-11 flex-1 rounded-xl border border-line font-semibold">
              Annuler
            </button>
            <button type="submit" disabled={busy || next.length < 4 || confirm.length < 4} className="h-11 flex-1 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-50">
              {busy ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}

      {error ? <p role="alert" className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      {note ? <p role="status" className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm font-medium">{note}</p> : null}
    </section>
  );
}
