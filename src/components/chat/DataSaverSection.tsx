"use client";

import { useDataSaver, type DataSaverMode } from "@/hooks/useDataSaver";

const OPTIONS: { id: DataSaverMode; label: string; hint: string }[] = [
  { id: "auto", label: "Automatique", hint: "S'active tout seul quand ta connexion est lente ou que ton téléphone est en économie de données." },
  { id: "on", label: "Toujours activée", hint: "Idéal avec un petit forfait." },
  { id: "off", label: "Désactivée", hint: "Tout se charge normalement." },
];

/** Réglages « Économie de données » : mode faible connexion */
export default function DataSaverSection() {
  const { mode, active, constrained, setMode } = useDataSaver();

  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Économie de données</h3>
      <p className="mb-2 text-sm text-muted">
        Les photos des autres se chargent quand tu les touches, les aperçus de liens sont masqués, et tes photos sont
        envoyées plus légères.
      </p>
      <div role="radiogroup" aria-label="Économie de données" className="space-y-1">
        {OPTIONS.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-2 hover:bg-bg">
            <input
              type="radio"
              name="data-saver"
              checked={mode === option.id}
              onChange={() => setMode(option.id)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="block text-sm text-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p role="status" className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm">
        {active
          ? "Économie de données active en ce moment."
          : constrained
            ? "Connexion lente détectée, mais l'économie est désactivée."
            : "Économie de données inactive en ce moment."}
      </p>
    </section>
  );
}
