"use client";

import { Users } from "lucide-react";
import { hueFromId } from "@/lib/utils";
import { useStatuses } from "../status/StatusProvider";

type AvatarProps = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
  size?: number;
  online?: boolean;
  /** N'affiche jamais l'anneau de statut (ex. : l'écran d'un appel) */
  noStatusRing?: boolean;
  /**
   * Un toucher sur la photo ouvre le statut quand il y en a un. À réserver aux endroits où la photo n'est pas déjà
   * dans un bouton ou un lien (on ne peut pas imbriquer deux éléments cliquables).
   */
  openStatusOnClick?: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export default function Avatar({ id, name, avatarUrl, isGroup, size = 48, online, noStatusRing, openStatusOnClick }: AvatarProps) {
  const statuses = useStatuses();
  // Anneau : orange vif s'il y a un statut que je n'ai pas vu, gris discret si je l'ai déjà vu (comme WhatsApp)
  const ring = noStatusRing || isGroup ? null : (statuses?.ringOf(id) ?? null);

  const style = {
    width: size,
    height: size,
    backgroundColor: `hsl(${hueFromId(id)} 42% 36%)`,
    fontSize: Math.round(size * 0.38),
  };

  const picture = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" loading="lazy" decoding="async" className="rounded-full object-cover" style={style} />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full font-display font-semibold text-white"
      style={style}
    >
      {isGroup ? <Users size={Math.round(size * 0.46)} strokeWidth={2} /> : initials(name)}
    </span>
  );

  const content = (
    <>
      {picture}
      {ring ? (
        <>
          {/* L'anneau déborde de la photo sans rien décaler autour */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute rounded-full ${ring === "unseen" ? "border-accent" : "border-muted/50"}`}
            style={{
              inset: size >= 36 ? -4 : -3,
              borderWidth: size >= 36 ? 2.5 : 2,
              borderStyle: "solid",
            }}
          />
          <span className="sr-only">{ring === "unseen" ? "Nouveau statut" : "Statut déjà vu"}</span>
        </>
      ) : null}
      {online ? (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-panel"
          title="En ligne"
        >
          <span className="sr-only">En ligne</span>
        </span>
      ) : null}
    </>
  );

  if (openStatusOnClick && ring && statuses) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          statuses.openUserStatus(id);
        }}
        aria-label={`Voir le statut de ${name}`}
        className="relative inline-flex shrink-0 rounded-full"
        style={{ width: size, height: size }}
      >
        {content}
      </button>
    );
  }

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {content}
    </span>
  );
}
