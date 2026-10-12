import Link from "next/link";
import type { ReactNode } from "react";

/** Mise en page commune des pages légales (publiques : pas besoin d'être connecté) */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-bg px-5 py-8">
      <Link href="/" className="text-sm font-semibold text-brand underline">
        ← Rodchat
      </Link>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Dernière mise à jour : {updated}</p>
      <div className="mt-6 space-y-6 text-[15px] leading-relaxed">{children}</div>
      <nav className="mt-10 flex gap-4 border-t border-line pt-4 text-sm">
        <Link href="/conditions" className="font-semibold text-brand underline">
          Conditions d&apos;utilisation
        </Link>
        <Link href="/confidentialite" className="font-semibold text-brand underline">
          Confidentialité
        </Link>
      </nav>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-ink/90">{children}</div>
    </section>
  );
}

export const contactEmail = () => process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";

export function Contact() {
  const email = contactEmail();
  return email ? (
    <a href={`mailto:${email}`} className="font-semibold text-brand underline">
      {email}
    </a>
  ) : (
    <span>l&apos;éditeur du service (via les coordonnées indiquées sur le site)</span>
  );
}
