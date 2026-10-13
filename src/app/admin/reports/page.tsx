import Link from "next/link";
import ReportActions from "@/components/admin/ReportActions";
import { isAdminUsername } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { reasonLabel } from "@/lib/report-reasons";

export const dynamic = "force-dynamic";

export default async function AdminReports({ searchParams }: { searchParams: { status?: string } }) {
  const resolved = searchParams.status === "resolved";
  const reports = await prisma.report.findMany({
    where: { status: resolved ? "RESOLVED" : "OPEN" },
    orderBy: resolved ? { resolvedAt: "desc" } : { createdAt: "desc" },
    take: 100,
  });

  const userIds = Array.from(new Set(reports.flatMap((r) => [r.reporterId, ...(r.targetUserId ? [r.targetUserId] : [])])));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, username: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id: string) => {
    const user = byId.get(id);
    return user ? `${user.displayName} (@${user.username})` : "compte supprimé";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">
          {resolved ? "Signalements traités" : `Signalements à traiter (${reports.length})`}
        </h2>
        <Link
          href={resolved ? "/admin/reports" : "/admin/reports?status=resolved"}
          className="text-sm font-semibold text-brand underline"
        >
          {resolved ? "Voir les ouverts" : "Voir les traités"}
        </Link>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-2xl bg-panel p-6 text-center text-muted">
          {resolved ? "Aucun signalement traité." : "Aucun signalement en attente."}
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => {
            const target = report.targetUserId ? byId.get(report.targetUserId) : null;
            const canSuspend = !resolved && Boolean(target) && !isAdminUsername(target?.username);
            return (
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
                {resolved ? (
                  <p className="mt-2 text-xs text-muted">
                    Traité le {report.resolvedAt?.toLocaleString("fr-FR") ?? "—"}
                  </p>
                ) : (
                  <ReportActions id={report.id} hasMessage={Boolean(report.messageId)} canSuspend={canSuspend} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
