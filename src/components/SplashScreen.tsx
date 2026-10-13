"use client";

import { useEffect, useState, type CSSProperties } from "react";

const WORD = "rodchat";

/**
 * Animation d'introduction au démarrage : la bulle apparaît, le « R » se pose, le nom se déploie, puis l'écran
 * s'efface (environ 2,5 s). Elle ne joue qu'une fois par session : pas de rebelote quand on recharge la page.
 * Un toucher ou un clic la ferme tout de suite. Les personnes qui ont réduit les animations en voient une version calme.
 *
 * Elle s'efface aussi toute seule par CSS : si JavaScript tarde ou échoue, elle ne bloque jamais l'écran.
 */
export default function SplashScreen() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem("rodchat-splash", "1");
    } catch {
      /* stockage indisponible : l'animation rejouera au prochain chargement, sans conséquence */
    }
    const timer = setTimeout(() => setGone(true), 2700);
    return () => clearTimeout(timer);
  }, []);

  if (gone) return null;

  return (
    <div className="splash" aria-hidden="true" onClick={() => setGone(true)}>
      <div className="relative flex items-center justify-center">
        <div className="splash-glow" />
        <svg className="splash-mark" viewBox="90 102 332 332">
          <rect className="bubble" x="96" y="108" width="320" height="250" rx="78" fill="#F5B335" />
          <path className="tail" d="M146 338 L134 428 L226 358 Z" fill="#F5B335" />
          <path
            className="letter"
            fill="#2B1D44"
            fillRule="evenodd"
            d="M203 160 H276 C304 160 318 179 318 202 C318 224 305 239 284 245 L320 305 H275 L243 249 V305 H203 Z M243 192 V219 H270 C281 219 286 213 286 205.5 C286 198 281 192 270 192 Z"
          />
        </svg>
      </div>
      <p className="splash-word">
        {WORD.split("").map((letter, index) => (
          <span key={index} style={{ "--i": index } as CSSProperties}>
            {letter}
          </span>
        ))}
      </p>
    </div>
  );
}
