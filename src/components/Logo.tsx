import type { CSSProperties } from "react";

// Logo de Rodchat en vecteur (SVG) : net à toutes les tailles, sur écran standard comme sur écran haute densité.
// La bulle est toujours ambre et le « R » toujours violet foncé, en thème clair comme en thème sombre.

const AMBER = "#F5B335";
const PLUM = "#2B1D44";

/** La bulle avec son « R », sans fond */
export function LogoMark({ size = 48, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="90 102 332 332"
      width={size}
      height={size}
      role="img"
      aria-label="Rodchat"
      className={className}
      style={style}
    >
      <rect x="96" y="108" width="320" height="250" rx="78" fill={AMBER} />
      <path d="M146 338 L134 428 L226 358 Z" fill={AMBER} />
      <path
        fill={PLUM}
        fillRule="evenodd"
        d="M203 160 H276 C304 160 318 179 318 202 C318 224 305 239 284 245 L320 305 H275 L243 249 V305 H203 Z M243 192 V219 H270 C281 219 286 213 286 205.5 C286 198 281 192 270 192 Z"
      />
    </svg>
  );
}

/** Logo complet : la bulle et le nom « rodchat » */
export default function Logo({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <span
        className="font-display font-extrabold leading-none tracking-tight text-brand"
        style={{ fontSize: size * 0.82 }}
      >
        rodchat
      </span>
    </span>
  );
}
