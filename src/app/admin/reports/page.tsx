import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ResolveReportButton from "@/components/ResolveReportButton";
import { isAdminUsername } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { reasonLabel } from "@/lib/report-reasons";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Signalements" };
export const dynamic = "force-dynamic";

// Réservé aux administrateurs (variable ADMIN_USERNAMES) : les autres obtiennent une page « introuvable ».
export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/reports");
  if (!isAdminUsername(user.username)) notFound();

  const reports = await prisma.report.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const reporters = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(reports.map((r) => r.reporterId))) } },
    select: { id: true, displayName: true, username: true },
  });
  const nameOf = (id: string) => {
    const reporter = reporters.find((r) => r.id === id);
    return reporter ? `${reporter.displayName} (@${reporter.username})` : "compte supprimé";
  };

  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-bg px-4 py-8">
      <Link href="/chat" className="text-sm font-semibold text-brand underline">
        ← Retour à Rodchat
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold">Signalements à traiter ({reports.length})</h1>

      {reports.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-panel p-6 text-center text-muted">Aucun signalement en attente.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {reports.map((report) => (
            <li key={report.id} className="rounded-2xl bg-panel p-4 shadow-sm">
              <p className="text-xs text-muted">
                {report.createdAt.toLocaleString("fr-FR")} · signalé par {nameOf(report.reporterId)}
              </p>
              <p className="mt-1 font-display font-semibold">{reasonLabel(report.reason)}</p>
              <p className="text-sm">
                Personne signalée : <span className="font-medium">{report.targetName ?? "inconnue"}</span>
              </p>
              {report.messageExcerpt ? (
                <blockquote className="mt-2 whitespace-pre-wrap break-words rounded-xl border-l-4 border-brand bg-bg px-3 py-2 text-sm">
                  {report.messageExcerpt}
                </blockquote>
              ) : null}
              {report.details ? <p className="mt-2 text-sm text-muted">Précisions : {report.details}</p> : null}
              <div className="mt-3">
                <ResolveReportButton id={report.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
