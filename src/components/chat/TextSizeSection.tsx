"use client";

import { useEffect, useState } from "react";
import { TEXT_SIZES, TEXT_SIZE_COOKIE, parseTextSize, type TextSizeId } from "@/lib/text-size";

/** Réglages « Taille du texte » */
export default function TextSizeSection() {
  const [size, setSize] = useState<TextSizeId>("normal");

  useEffect(() => {
    setSize(parseTextSize(document.documentElement.getAttribute("data-textsize") ?? undefined));
  }, []);

  function choose(id: TextSizeId) {
    setSize(id);
    const root = document.documentElement;
    if (id === "normal") root.removeAttribute("data-textsize");
    else root.setAttribute("data-textsize", id);
    document.cookie = `${TEXT_SIZE_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Taille du texte</h3>
      <p className="mb-2 text-sm text-muted">Agrandit les textes et les boutons de toute l&apos;application. Enregistré sur cet appareil.</p>
      <div role="radiogroup" aria-label="Taille du texte" className="grid grid-cols-3 gap-2">
        {TEXT_SIZES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={size === item.id}
            onClick={() => choose(item.id)}
            className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 ${
              size === item.id ? "border-brand bg-brand/10 font-semibold" : "border-line"
            }`}
          >
            <span aria-hidden="true" className={`${item.sample} leading-none`}>
              Aa
            </span>
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
