import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminNav from "@/components/admin/AdminNav";
import { isAdminUsername } from "@/lib/admin";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Tout /admin est réservé aux administrateurs (ADMIN_USERNAMES) : les autres obtiennent une page « introuvable ».
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUsername(user.username)) notFound();

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <h1 className="font-display text-lg font-bold">Rodchat · Administration</h1>
          <Link href="/chat" className="text-sm font-semibold text-brand underline">
            Retour à la messagerie
          </Link>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
