import { prisma } from "@/lib/prisma";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

const FREE_DB_BYTES = 512 * 1024 * 1024; // offre gratuite de Neon : 0,5 Go

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-panel p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function AdminDashboard() {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [users, activeToday, newThisWeek, suspended, messages, messagesToday, directChats, groups, statuses, openReports, size] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastSeenAt: { gt: day } } }),
      prisma.user.count({ where: { createdAt: { gt: week } } }),
      prisma.user.count({ where: { suspendedAt: { not: null } } }),
      prisma.message.count(),
      prisma.message.count({ where: { createdAt: { gt: day } } }),
      prisma.conversation.count({ where: { isGroup: false } }),
      prisma.conversation.count({ where: { isGroup: true } }),
      prisma.status.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
    ]);

  const pushSubscriptions = await prisma.pushSubscription.count();
  const used = Number(size[0]?.size ?? 0);
  const percent = Math.min(100, Math.round((used / FREE_DB_BYTES) * 100));

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">Tableau de bord</h2>

      {pushConfigured() ? (
        <p className="rounded-2xl bg-panel p-4 text-sm text-muted shadow-sm">
          Notifications : activées sur le serveur. {pushSubscriptions} appareil{pushSubscriptions > 1 ? "s" : ""} abonné
          {pushSubscriptions > 1 ? "s" : ""}.
        </p>
      ) : (
        <p role="alert" className="rounded-2xl bg-danger/10 p-4 text-sm text-danger shadow-sm">
          <strong>Notifications désactivées.</strong> Les clés VAPID manquent : personne ne reçoit de notification
          quand l&apos;application est fermée. Génère-les avec <code>npx web-push generate-vapid-keys</code>, ajoute
          NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT dans Vercel, puis redéploie.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Comptes" value={users} hint={`${newThisWeek} nouveau${newThisWeek > 1 ? "x" : ""} cette semaine`} />
        <Card label="Actifs (24 h)" value={activeToday} />
        <Card label="Messages (24 h)" value={messagesToday} hint={`${messages} au total`} />
        <Card label="Signalements ouverts" value={openReports} />
        <Card label="Discussions à deux" value={directChats} />
        <Card label="Groupes" value={groups} />
        <Card label="Statuts en cours" value={statuses} />
        <Card label="Comptes suspendus" value={suspended} />
      </div>

      <section className="rounded-2xl bg-panel p-4 shadow-sm">
        <h3 className="font-display text-lg font-semibold">Espace de stockage (base de données)</h3>
        <p className="mt-1 text-sm text-muted">
          {formatBytes(used)} utilisés. L&apos;offre gratuite de Neon est limitée à 512 Mo : photos, vocaux et fichiers y sont
          stockés.
        </p>
        <div
          className="mt-3 h-3 overflow-hidden rounded-full bg-bg"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Espace utilisé"
        >
          <div className={`h-full ${percent >= 85 ? "bg-danger" : "bg-brand"}`} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{percent} % de l&apos;offre gratuite</p>
      </section>

      <p className="rounded-2xl bg-panel p-4 text-sm text-muted shadow-sm">
        Pour la vie privée des utilisateurs, l&apos;espace admin ne permet pas de lire leurs conversations. Tu vois les
        comptes, les groupes (nom et nombre de membres), et le contenu <strong>uniquement</strong> des messages qui t&apos;ont été
        signalés.
      </p>
    </div>
  );
}
