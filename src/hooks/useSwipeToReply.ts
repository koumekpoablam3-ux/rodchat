"use client";

import { useRef, useState, type CSSProperties } from "react";

const TRIGGER_PX = 56;
const MAX_PX = 72;

/**
 * Glisser un message vers la droite pour y répondre (téléphone et tablette).
 * Le défilement vertical reste libre : le geste ne s'enclenche que s'il est clairement horizontal.
 * À brancher sur la ligne du message ; `style` fait suivre le doigt, `progress` (0 à 1) sert à l'icône.
 */
export function useSwipeToReply(onReply: (() => void) | undefined) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef(false);
  const armed = useRef(false);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);

  const move = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };
  const reset = () => {
    start.current = null;
    locked.current = false;
    armed.current = false;
    if (offsetRef.current !== 0) move(0);
  };

  if (!onReply) return { handlers: {}, style: undefined as CSSProperties | undefined, progress: 0 };

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      // La souris n'a pas besoin de ce geste (clic droit / menu)
      if (event.pointerType !== "touch") return;
      start.current = { x: event.clientX, y: event.clientY };
      locked.current = false;
      armed.current = false;
    },
    onPointerMove: (event: React.PointerEvent) => {
      const origin = start.current;
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;

      if (!locked.current) {
        // Plutôt vertical : c'est un défilement, on laisse faire
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          start.current = null;
          return;
        }
        if (dx > 12 && dx > Math.abs(dy) * 1.5) {
          locked.current = true;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* sans conséquence */
          }
        } else {
          return;
        }
      }

      const value = Math.max(0, Math.min(MAX_PX, dx * 0.7));
      move(value);
      if (value >= TRIGGER_PX && !armed.current) {
        armed.current = true;
        navigator.vibrate?.(10);
      } else if (value < TRIGGER_PX) {
        armed.current = false;
      }
    },
    onPointerUp: () => {
      const triggered = locked.current && offsetRef.current >= TRIGGER_PX;
      reset();
      if (triggered) onReply();
    },
    onPointerCancel: reset,
  };

  const style: CSSProperties = {
    touchAction: "pan-y",
    transform: offset > 0 ? `translateX(${offset}px)` : undefined,
    transition: offset === 0 ? "transform 160ms ease-out" : undefined,
  };
  return { handlers, style, progress: Math.min(1, offset / TRIGGER_PX) };
}
