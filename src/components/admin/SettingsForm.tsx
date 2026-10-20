"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { mode: "open" | "invite" | "closed"; code: string; announcement: string; directory: "on" | "off" };

const MODES = [
  { id: "open", label: "Ouverte", hint: "Tout le monde peut créer un compte." },
  { id: "invite", label: "Sur invitation", hint: "Il faut connaître le code d'invitation." },
  { id: "closed", label: "Fermée", hint: "Personne ne peut créer de compte." },
] as const;

/** Réglages de la plateforme : inscription et annonce */
export default function SettingsForm(initial: Props) {
  const router = useRouter();
  const [mode, setMode] = useState(initial.mode);
  const [code, setCode] = useState(initial.code);
  const [announcement, setAnnouncement] = useState(initial.announcement);
  const [directory, setDirectory] = useState(initial.directory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationMode: mode, inviteCode: code, announcement, directory }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      return setError(data?.error ?? "Enregistrement impossible.");
    }
    setSaved(true);
    router.refresh();
  }

  const link = typeof window !== "undefined" && code ? `${window.location.origin}/register?code=${encodeURIComponent(code)}` : "";

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="rounded-2xl bg-panel p-4">
        <legend className="px-1 font-display text-lg font-semibold">Inscription</legend>
        <div className="mt-1 space-y-1">
          {MODES.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-bg">
              <input type="radio" name="mode" checked={mode === item.id} onChange={() => setMode(item.id)} className="mt-1 h-4 w-4" />
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="block text-sm text-muted">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === "invite" ? (
          <div className="mt-3">
            <label htmlFor="code" className="mb-1 block text-sm font-medium">
              Code d&apos;invitation
            </label>
            <input
              id="code"
              value={code}
              maxLength={100}
              onChange={(event) => setCode(event.target.value)}
              autoCapitalize="none"
              className="h-11 w-full rounded-xl border border-line bg-bg px-3"
            />
            {link ? (
              <p className="mt-2 break-all text-sm text-muted">
                Lien à partager : <span className="select-all font-medium text-ink">{link}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="rounded-2xl bg-panel p-4">
        <legend className="px-1 font-display text-lg font-semibold">Liste des inscrits</legend>
        <p className="mb-2 text-sm text-muted">
          Dans « Nouvelle discussion », tout le monde peut voir la liste de tous les inscrits. Masquée, elle disparaît : on retrouve
          ses contacts par leur numéro (numéros vérifiés), ou en écrivant le nom d&apos;utilisateur exact.
        </p>
        <div className="space-y-1">
          {(
            [
              ["on", "Visible", "Tous les inscrits apparaissent."],
              ["off", "Masquée", "Plus protecteur pour la vie privée."],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-bg">
              <input type="radio" name="directory" checked={directory === id} onChange={() => setDirectory(id)} className="mt-1 h-4 w-4" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="rounded-2xl bg-panel p-4">
        <label htmlFor="announcement" className="font-display text-lg font-semibold">
          Annonce à tous les utilisateurs
        </label>
        <p className="mb-2 text-sm text-muted">
          S&apos;affiche en bas de l&apos;écran pour chaque personne connectée, qui peut la fermer. Laisse vide pour ne rien afficher.
        </p>
        <textarea
          id="announcement"
          value={announcement}
          maxLength={300}
          rows={3}
          onChange={(event) => setAnnouncement(event.target.value)}
          className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2"
        />
        <p className="text-right text-xs text-muted">{announcement.length}/300</p>
      </section>

      {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      {saved ? <p role="status" className="rounded-xl bg-panel px-3 py-2 text-sm font-medium">Réglages enregistrés.</p> : null}

      <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60">
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
