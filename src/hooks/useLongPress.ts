"use client";

import { useCallback, useRef } from "react";

/**
 * Appui long au doigt (ouvre un menu, comme WhatsApp). Le clic droit à la souris
 * fait la même chose. Un déplacement du doigt annule l'appui.
 */
export function useLongPress(onLongPress: () => void, delayMs = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      // La souris utilise le clic droit ; seul le toucher passe par l'appui long
      if (event.pointerType !== "touch") return;
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, delayMs);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const start = origin.current;
      if (!start) return;
      if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      cancel();
      onLongPress();
    },
    /** À brancher sur onClickCapture : empêche le clic qui suit un appui long d'ouvrir la discussion */
    onClickCapture: (event: React.MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
