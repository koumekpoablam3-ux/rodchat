"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import { COUNTRIES, dialOf, formatPhone, guessDial } from "@/lib/phone";
import { useChat } from "./ChatProvider";

type PhoneInfo = { phone: string | null; verified: boolean; discoverable: boolean; smsAvailable: boolean };

const field = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px]";

/** Réglages « Mon numéro » : numéro de téléphone, vérification, et « me retrouver par mon numéro » */
export default function PhoneSection() {
  const { me } = useChat();
  const [info, setInfo] = useState<PhoneInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [dial, setDial] = useState("225");
  const [national, setNational] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const result = await apiRequest<PhoneInfo>("/api/account/phone");
    if (result.ok) setInfo(result.data);
  }, []);

  useEffect(() => {
    void load();
    setDial(guessDial(Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, [load]);

  async function savePhone(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    const result = await apiRequest("/api/account/phone", { method: "PUT", json: { dial, national } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setEditing(false);
    setNational("");
    setCodeSent(false);
    setNote("Numéro enregistré.");
    await load();
  }

  async function sendCode() {
    setBusy(true);
    setError("");
    setNote("");
    const result = await apiRequest("/api/account/phone/send-code", { method: "POST" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCodeSent(true);
    setNote("Code envoyé par SMS. Il est valable 10 minutes.");
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await apiRequest("/api/account/phone/verify", { method: "POST", json: { code } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCode("");
    setCodeSent(false);
    setNote("Numéro vérifié.");
    await load();
  }

  async function setDiscoverable(value: boolean) {
    setInfo((previous) => (previous ? { ...previous, discoverable: value } : previous));
    const result = await apiRequest("/api/account/phone", { method: "PATCH", json: { discoverable: value } });
    if (!result.ok) {
      setError(result.error);
      await load();
    }
  }

  if (!info) return null;

  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Mon numéro</h3>

      {info.phone && !editing ? (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{formatPhone(info.phone)}</span>
            {info.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">
                <BadgeCheck size={14} aria-hidden="true" /> Vérifié
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/25 px-2 py-0.5 text-xs font-bold">
                <ShieldAlert size={14} aria-hidden="true" /> Non vérifié
              </span>
            )}
          </p>
          <p className="text-sm text-muted">
            Ton identifiant : <span className="font-medium text-ink">@{me.username}</span> (pour les mentions). Les autres personnes ne voient jamais ton numéro.
          </p>

          {!info.verified ? (
            <div className="rounded-xl bg-bg p-3 text-sm">
              <p>
                Un numéro vérifié permet de <strong>retrouver tes contacts</strong> sur Rodchat et de te faire retrouver par eux.
              </p>
              {info.smsAvailable ? (
                codeSent ? (
                  <form onSubmit={verify} className="mt-3 flex gap-2">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      aria-label="Code reçu par SMS"
                      placeholder="Code à 6 chiffres"
                      className={`${field} text-center tracking-[0.3em]`}
                    />
                    <button type="submit" disabled={busy || code.length !== 6} className="h-11 shrink-0 rounded-xl bg-brand px-4 font-semibold text-brand-ink disabled:opacity-50">
                      Valider
                    </button>
                  </form>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void sendCode()} className="mt-3 h-11 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-50">
                    Recevoir un code par SMS
                  </button>
                )
              ) : (
                <p className="mt-2 text-muted">
                  L&apos;envoi de SMS n&apos;est pas activé sur ce service : demande à l&apos;administrateur de vérifier ton numéro (il peut t&apos;appeler ou t&apos;écrire pour s&apos;assurer que c&apos;est bien toi).
                </p>
              )}
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-2 hover:bg-bg">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={info.discoverable} onChange={(e) => void setDiscoverable(e.target.checked)} />
            <span>
              <span className="block font-medium">Me retrouver par mon numéro</span>
              <span className="block text-sm text-muted">Les personnes qui ont mon numéro dans leurs contacts voient que je suis sur Rodchat.</span>
            </span>
          </label>

          <button type="button" onClick={() => { setEditing(true); setError(""); setNote(""); }} className="h-10 w-full rounded-xl border border-line text-sm font-semibold hover:bg-bg">
            Changer mon numéro
          </button>
        </div>
      ) : (
        <form onSubmit={savePhone} className="space-y-3">
          {!info.phone ? (
            <p className="text-sm text-muted">Ajoute ton numéro pour te connecter avec et retrouver tes contacts.</p>
          ) : (
            <p className="text-sm text-muted">Le nouveau numéro devra être vérifié de nouveau.</p>
          )}
          <div className="flex gap-2">
            <select aria-label="Pays" value={dial} onChange={(e) => setDial(e.target.value)} className="h-11 w-[7.5rem] shrink-0 rounded-xl border border-line bg-bg px-2 text-[15px]">
              {COUNTRIES.map((country) => (
                <option key={country.iso} value={country.dial}>
                  {country.iso} +{country.dial}
                </option>
              ))}
            </select>
            <input
              className={field}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={national}
              onChange={(e) => setNational(e.target.value)}
              placeholder={info.phone ? `Actuel : ${formatPhone(info.phone)}` : "07 12 34 56 78"}
              aria-label="Numéro de téléphone"
            />
          </div>
          <div className="flex gap-2">
            {info.phone ? (
              <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-xl border border-line font-semibold">
                Annuler
              </button>
            ) : null}
            <button type="submit" disabled={busy || national.trim().length < 4} className="h-11 flex-1 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-50">
              {busy ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}

      {error ? <p role="alert" className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      {note ? <p role="status" className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm font-medium">{note}</p> : null}
      <span className="sr-only">{info.phone ? `Indicatif ${dialOf(info.phone) ?? ""}` : ""}</span>
    </section>
  );
}
