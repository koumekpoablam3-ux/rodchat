"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/metrics", label: "Indicateurs" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/groups", label: "Groupes" },
  { href: "/admin/reports", label: "Signalements" },
  { href: "/admin/settings", label: "Réglages" },
  { href: "/admin/logs", label: "Journal" },
];

export default function AdminNav() {
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
          </Link>
        );
      })}
    </nav>
  );
}
