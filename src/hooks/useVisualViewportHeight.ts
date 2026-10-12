"use client";

import { useEffect } from "react";

/**
 * Sur iPhone (surtout l'app installée), le clavier recouvre la page au lieu de la réduire : la zone de saisie
 * disparaît derrière lui. On suit la zone réellement visible (visualViewport) dans la variable CSS --app-height.
 * Pendant un zoom par pincement, on ne touche à rien.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;

    const apply = () => {
      if (viewport.scale > 1.01) {
        root.style.removeProperty("--app-height");
        return;
      }
      root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
      // iOS décale la page quand le clavier s'ouvre : on la remet en haut pour que la hauteur corresponde
      if (viewport.offsetTop > 0) window.scrollTo(0, 0);
    };

    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.style.removeProperty("--app-height");
    };
  }, []);
}
