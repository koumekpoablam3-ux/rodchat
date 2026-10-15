"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { EMOJI_CATEGORIES, normalizeSearch } from "@/lib/emoji-data";

const RECENT_KEY = "rodchat-emoji-recent";
const MAX_RECENT = 24;

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function rememberEmoji(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* sans conséquence */
  }
}

type EmojiPickerProps = {
  onPick: (emoji: string) => void;
  onClose: () => void;
};

/** Sélecteur d'emojis : récents, catégories et recherche en français */
export default function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0].id);
  const [recent, setRecent] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setRecent(readRecent()), []);

  // Fermeture : touche Échap, ou un clic en dehors
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  const q = normalizeSearch(query);
  const results = useMemo(() => {
    if (!q) return null;
    const found: string[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const [emoji, words] of cat.emojis) {
        if (words.includes(q) || cat.label.toLowerCase().includes(q)) found.push(emoji);
      }
    }
    return found;
  }, [q]);

  const current = EMOJI_CATEGORIES.find((c) => c.id === category) ?? EMOJI_CATEGORIES[0];
  const shown = results ?? current.emojis.map(([emoji]) => emoji);

  function pick(emoji: string) {
    rememberEmoji(emoji);
    setRecent(readRecent());
    onPick(emoji);
  }

  const grid = (list: string[], label: string) => (
    <div role="group" aria-label={label} className="grid grid-cols-8 gap-0.5">
      {list.map((emoji) => (
        <button
          key={emoji}
          type="button"
          // onMouseDown : le champ de saisie garde le focus et le curseur
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(emoji)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[22px] leading-none hover:bg-bg focus-visible:bg-bg"
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Choisir un emoji"
      className="rise absolute bottom-full left-0 z-30 mb-2 w-[19.5rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-panel p-2 shadow-2xl"
    >
      <label className="relative mb-2 block">
        <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Chercher (ex. : rire, cœur, merci)"
          aria-label="Chercher un emoji"
          className="h-9 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-sm"
        />
      </label>

      {!q ? (
        <div role="tablist" aria-label="Catégories" className="mb-2 flex gap-0.5 overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={cat.id === category}
              aria-label={cat.label}
              title={cat.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCategory(cat.id)}
              className={`h-8 w-8 shrink-0 rounded-lg text-lg ${cat.id === category ? "bg-brand/15" : "hover:bg-bg"}`}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      ) : null}

      <div className="scroll-thin max-h-56 overflow-y-auto">
        {!q && recent.length > 0 ? (
          <section className="mb-2">
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Récents</h3>
            {grid(recent, "Emojis récents")}
          </section>
        ) : null}

        {results && results.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">Aucun emoji ne correspond.</p>
        ) : (
          <section>
            {!q ? <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{current.label}</h3> : null}
            {grid(shown, q ? "Résultats" : current.label)}
          </section>
        )}
      </div>
    </div>
  );
}
