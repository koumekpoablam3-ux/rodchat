const KEY = "rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-xs";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Chercher une discussion ou un message" },
  { keys: ["Alt", "↑"], label: "Discussion précédente" },
  { keys: ["Alt", "↓"], label: "Discussion suivante" },
  { keys: ["Entrée"], label: "Envoyer le message" },
  { keys: ["Maj", "Entrée"], label: "Passer à la ligne" },
  { keys: ["Ctrl", "B"], label: "Mettre la sélection en gras" },
  { keys: ["Ctrl", "I"], label: "Mettre la sélection en italique" },
];

/** Aide sur les raccourcis clavier et la mise en forme, visible sur ordinateur seulement */
export default function ShortcutsSection() {
  return (
    <section className="hidden md:block">
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Raccourcis clavier</h3>
      <ul className="space-y-1.5 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.label} className="flex items-center justify-between gap-4">
            <span>{shortcut.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd key={key} className={KEY}>
                  {key}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        Mise en forme dans un message : <strong>*gras*</strong>, <em>_italique_</em>, <s>~barré~</s> et{" "}
        <code className="rounded bg-black/10 px-1 font-mono text-[0.9em]">`code`</code>. Tu peux aussi coller une capture
        d&apos;écran ou glisser-déposer des fichiers dans la discussion.
      </p>
    </section>
  );
}
