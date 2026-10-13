import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Trace de toutes les actions d'administration (qui a fait quoi, sur qui, quand)
export default async function AdminLogs() {
  const logs = await prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Journal des actions</h2>
      {logs.length === 0 ? (
        <p className="rounded-2xl bg-panel p-6 text-center text-muted">Aucune action pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id} className="rounded-2xl bg-panel p-3 text-sm shadow-sm">
              <p>
                <span className="font-semibold">{log.action}</span>
                {log.targetName ? <span> · {log.targetName}</span> : null}
              </p>
              {log.details ? <p className="text-muted">{log.details}</p> : null}
              <p className="mt-1 text-xs text-muted">
                {log.createdAt.toLocaleString("fr-FR")} · par {log.adminName}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
