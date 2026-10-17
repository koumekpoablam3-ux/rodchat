"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/metrics", label: "Indicateurs" },
  { href: "/admin/passwords", label: "Mots de passe" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/groups", label: "Groupes" },
  { href: "/admin/storage", label: "Stockage" },
  { href: "/admin/reports", label: "Signalements" },
  { href: "/admin/settings", label: "Réglages" },
  { href: "/admin/logs", label: "Journal" },
];

/** `badges` : nombre de choses à traiter, par adresse (ex. signalements en attente) */
export default function AdminNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="scroll-thin flex gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              active ? "bg-brand text-brand-ink" : "text-muted hover:bg-bg"
            }`}
          >
            {link.label}
            {badges[link.href] ? (
              <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold leading-5 text-accent-ink">
                {badges[link.href]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
