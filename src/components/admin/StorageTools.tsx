"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Big = { id: string; size: number; type: string; createdAt: string; sender: string; place: string };

const TYPES = [
  { id: "IMAGE", label: "Photos" },
  { id: "VIDEO", label: "Vidéos" },
  { id: "AUDIO", label: "Vocaux" },
  { id: "FILE", label: "Documents" },
] as const;
const LABELS: Record<string, string> = { IMAGE: "Photo", VIDEO: "Vidéo", AUDIO: "Vocal", FILE: "Document" };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
const btn = "h-10 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-bg disabled:opacity-50";

async function call(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = (await response?.json().catch(() => ({}))) as Record<string, unknown> | undefined;
  return { ok: Boolean(response?.ok), data: data ?? {} };
}

/** Outils de stockage : nettoyage par critères, nettoyage automatique à la demande, suppression des plus gros fichiers */
export default function StorageTools({ biggest }: { biggest: Big[] }) {
  const router = useRouter();
  const [types, setTypes] = useState<string[]>(["VIDEO", "IMAGE"]);
  const [days, setDays] = useState(90);
  const [minMb, setMinMb] = useState(0);
  const [estimate, setEstimate] = useState<{ n: number; bytes: number } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  // Estimation recalculée à chaque changement de critère
  useEffect(() => {
    if (types.length === 0) return setEstimate(null);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await call({ action: "preview", types, olderThanDays: days, minSizeMb: minMb });
      if (!cancelled && result.ok) setEstimate({ n: Number(result.data.n ?? 0), bytes: Number(result.data.bytes ?? 0) });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [types, days, minMb]);

  const toggle = (id: string) => setTypes((list) => (list.includes(id) ? list.filter((t) => t !== id) : [...list, id]));

  async function purge() {
    setBusy(true);
    setError("");
    setNote("");
    const result = await call({ action: "purge", types, olderThanDays: days, minSizeMb: minMb });
    setBusy(false);
    if (!result.ok) return setError(String(result.data.error ?? "Suppression impossible."));
    setConfirm("");
    setNote(`${result.data.count} fichier(s) supprimé(s), ${mb(Number(result.data.bytes ?? 0))} libérés.`);
    router.refresh();
  }

  async function auto() {
    setBusy(true);
    setError("");
    setNote("");
    const result = await call({ action: "auto" });
    setBusy(false);
    if (!result.ok) return setError(String(result.data.error ?? "Impossible."));
    const r = result.data.result as { count: number; freedBytes: number; note: string } | null;
    setNote(
      r
        ? `${r.note} (${r.count} fichier(s), ${mb(r.freedBytes)})`
        : "Rien à faire : l'espace occupé par les médias est encore confortable.",
    );
    router.refresh();
  }

  async function removeOne(id: string) {
    if (!window.confirm("Supprimer ce fichier ? Le message restera, avec la mention « Fichier supprimé ».")) return;
    setBusy(true);
    await call({ action: "delete-one", id });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-panel p-4 shadow-sm">
        <h3 className="font-display text-lg font-semibold">Libérer de l&apos;espace</h3>
        <p className="mb-3 text-sm text-muted">
          Les fichiers choisis sont supprimés ; les messages restent avec la mention « Fichier supprimé ». Les médias
          épinglés ou en favoris sont toujours conservés.
        </p>

        <fieldset className="mb-3">
          <legend className="mb-1 text-sm font-medium">Types de fichiers</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((type) => (
              <label key={type.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                <input type="checkbox" checked={types.includes(type.id)} onChange={() => toggle(type.id)} className="h-4 w-4" />
                {type.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Envoyés il y a plus de
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal">
              <option value={0}>Peu importe (tous)</option>
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
              <option value={90}>90 jours</option>
              <option value={180}>6 mois</option>
              <option value={365}>1 an</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Taille d&apos;au moins
            <select value={minMb} onChange={(e) => setMinMb(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal">
              <option value={0}>Peu importe</option>
              <option value={1}>1 Mo</option>
              <option value={2}>2 Mo</option>
              <option value={4}>4 Mo</option>
            </select>
          </label>
        </div>

        <p role="status" className="mt-3 rounded-xl bg-bg px-3 py-2 text-sm">
          {estimate
            ? estimate.n === 0
              ? "Aucun fichier ne correspond à ces critères."
              : `${estimate.n} fichier${estimate.n > 1 ? "s" : ""} concerné${estimate.n > 1 ? "s" : ""}, environ ${mb(estimate.bytes)} à libérer.`
            : "Calcul…"}
        </p>

        {estimate && estimate.n > 0 ? (
          <div className="mt-3 space-y-2 rounded-xl bg-danger/10 p-3">
            <p className="text-sm font-medium">
              Action <strong>définitive</strong>. Tape <code className="rounded bg-panel px-1">SUPPRIMER</code> pour confirmer.
            </p>
            <div className="flex gap-2">
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-label="Confirmation"
                autoCapitalize="characters"
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 text-sm"
              />
              <button type="button" disabled={busy || confirm.trim().toUpperCase() !== "SUPPRIMER"} onClick={() => void purge()} className={`${btn} bg-danger text-white`}>
                {busy ? "…" : "Supprimer"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-panel p-4 shadow-sm">
        <h3 className="font-display text-lg font-semibold">Nettoyage automatique</h3>
        <p className="mb-3 text-sm text-muted">
          Se lance tout seul quand les médias remplissent 90 % de leur espace : il supprime les plus anciens (jamais ceux
          des 7 derniers jours, ni les épinglés ou favoris). Tu peux aussi le lancer maintenant.
        </p>
        <button type="button" disabled={busy} onClick={() => void auto()} className={btn}>
          Lancer le nettoyage automatique
        </button>
      </section>

      {note ? <p role="status" className="rounded-xl bg-panel px-3 py-2 text-sm font-medium shadow-sm">{note}</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}

      <section className="rounded-2xl bg-panel p-4 shadow-sm">
        <h3 className="font-display text-lg font-semibold">Les plus gros fichiers</h3>
        <p className="mb-2 text-sm text-muted">Type, taille, date et auteur seulement : le contenu n&apos;est jamais affiché.</p>
        {biggest.length === 0 ? (
          <p className="text-sm text-muted">Aucun fichier stocké.</p>
        ) : (
          <ul className="divide-y divide-line">
            {biggest.map((file) => (
              <li key={file.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {LABELS[file.type] ?? file.type} · {mb(file.size)}
                  </p>
                  <p className="truncate text-muted">
                    {file.sender} · {file.place} · {new Date(file.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <button type="button" disabled={busy} onClick={() => void removeOne(file.id)} className={`${btn} text-danger`}>
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
