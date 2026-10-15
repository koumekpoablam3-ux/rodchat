"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { PALETTE_COOKIE, PALETTES, parsePalette, type PaletteId } from "@/lib/palette";

/** Réglages « Couleur de l'application » */
export default function PaletteSection() {
  const [palette, setPalette] = useState<PaletteId>("aubergine");

  useEffect(() => {
    setPalette(parsePalette(document.documentElement.getAttribute("data-palette") ?? undefined));
  }, []);

  function choose(id: PaletteId) {
    setPalette(id);
    const root = document.documentElement;
    if (id === "aubergine") root.removeAttribute("data-palette");
    else root.setAttribute("data-palette", id);
    document.cookie = `${PALETTE_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Couleur</h3>
      <p className="mb-2 text-sm text-muted">Change la couleur des boutons, des titres et de tes messages. Enregistré sur cet appareil.</p>
      <div role="radiogroup" aria-label="Couleur de l'application" className="flex flex-wrap gap-3">
        {PALETTES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={palette === item.id}
            aria-label={item.label}
            title={item.label}
            onClick={() => choose(item.id)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full ring-offset-2 ring-offset-panel ${
              palette === item.id ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line"
            }`}
            style={{ backgroundColor: item.swatch }}
          >
            {palette === item.id ? <Check size={20} className="text-white" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
