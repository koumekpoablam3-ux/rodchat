import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Indicateurs de la section 7 du document de proposition : activité, rétention, fiabilité de la livraison,
// appels, signalements, stockage. Tout est calculé à partir des données existantes (rien de nouveau n'est collecté),
// sans jamais lire le contenu des messages.

type Day = { day: string; n: number; n2?: number };

function duration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min`;
  if (seconds < 36 * 3600) return `${(seconds / 3600).toFixed(1).replace(".", ",")} h`;
  return `${(seconds / 86400).toFixed(1).replace(".", ",")} j`;
}
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)} %` : "—");
const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-panel p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Histogramme simple sur 14 jours (une barre par jour) */
function Bars({ title, data, unit }: { title: string; data: Day[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((sum, d) => sum + d.n, 0);
  return (
    <section className="rounded-2xl bg-panel p-4 shadow-sm">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted">
        {total} sur 14 jours
      </p>
      <div className="mt-3 flex h-28 items-end gap-1" aria-hidden="true">
        {data.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${shortDay(d.day)} : ${d.n} ${unit}`}>
            <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(d.n > 0 ? 4 : 1, (d.n / max) * 100)}%`, opacity: d.n > 0 ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{shortDay(data[0].day)}</span>
        <span>{shortDay(data[data.length - 1].day)}</span>
      </div>
      <ol className="sr-only">
        {data.map((d) => (
          <li key={d.day}>
            {shortDay(d.day)} : {d.n} {unit}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function AdminMetrics() {
  const day = new Date(Date.now() - 24 * 3600 * 1000);
  const week = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const month = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [dau, wau, mau, users, signups, messageDays, retention, delivery, calls, reportsOpen, reportTimes, attachments, dbSize] =
    await Promise.all([
      prisma.user.count({ where: { lastSeenAt: { gt: day } } }),
      prisma.user.count({ where: { lastSeenAt: { gt: week } } }),
      prisma.user.count({ where: { lastSeenAt: { gt: month } } }),
      prisma.user.count(),
      prisma.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(c.n, 0)::int AS n
        FROM generate_series(date_trunc('day', now() AT TIME ZONE 'UTC') - interval '13 days', date_trunc('day', now() AT TIME ZONE 'UTC'), interval '1 day') AS d
        LEFT JOIN (
          SELECT date_trunc('day', "createdAt")::date AS day, count(*) AS n FROM "User"
          WHERE "createdAt" > (now() AT TIME ZONE 'UTC') - interval '14 days' GROUP BY 1
        ) c ON c.day = d::date
        ORDER BY d`,
      prisma.$queryRaw<{ day: string; n: number; writers: number }[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(c.n, 0)::int AS n, COALESCE(c.writers, 0)::int AS writers
        FROM generate_series(date_trunc('day', now() AT TIME ZONE 'UTC') - interval '13 days', date_trunc('day', now() AT TIME ZONE 'UTC'), interval '1 day') AS d
        LEFT JOIN (
          SELECT date_trunc('day', "createdAt")::date AS day, count(*) AS n, count(DISTINCT "senderId") AS writers FROM "Message"
          WHERE "createdAt" > (now() AT TIME ZONE 'UTC') - interval '14 days' AND "type" NOT IN ('SYSTEM', 'CALL') GROUP BY 1
        ) c ON c.day = d::date
        ORDER BY d`,
      prisma.$queryRaw<{ e7: number; k7: number; e30: number; k30: number }[]>`
        SELECT
          (count(*) FILTER (WHERE "createdAt" < (now() AT TIME ZONE 'UTC') - interval '7 days'))::int AS e7,
          (count(*) FILTER (WHERE "createdAt" < (now() AT TIME ZONE 'UTC') - interval '7 days' AND "lastSeenAt" >= "createdAt" + interval '7 days'))::int AS k7,
          (count(*) FILTER (WHERE "createdAt" < (now() AT TIME ZONE 'UTC') - interval '30 days'))::int AS e30,
          (count(*) FILTER (WHERE "createdAt" < (now() AT TIME ZONE 'UTC') - interval '30 days' AND "lastSeenAt" >= "createdAt" + interval '30 days'))::int AS k30
        FROM "User"`,
      prisma.$queryRaw<{ total: number; delivered: number; median_s: number | null; p95_s: number | null }[]>`
        SELECT count(*)::int AS total, count(r."deliveredAt")::int AS delivered,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r."deliveredAt" - m."createdAt"))) AS median_s,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r."deliveredAt" - m."createdAt"))) AS p95_s
        FROM "MessageReceipt" r JOIN "Message" m ON m."id" = r."messageId"
        WHERE m."createdAt" > (now() AT TIME ZONE 'UTC') - interval '7 days'
          AND m."createdAt" < (now() AT TIME ZONE 'UTC') - interval '5 minutes'`,
      prisma.call.groupBy({
        by: ["status"],
        where: { startedAt: { gt: month }, status: { in: ["ENDED", "MISSED", "DECLINED"] } },
        _count: { _all: true },
      }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.$queryRaw<{ avg_s: number | null; n: number }[]>`
        SELECT avg(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))::float AS avg_s, count(*)::int AS n FROM "Report"
        WHERE "status" = 'RESOLVED' AND "resolvedAt" > (now() AT TIME ZONE 'UTC') - interval '30 days'`,
      prisma.$queryRaw<{ bytes: number }[]>`
        SELECT (COALESCE((SELECT sum("size") FROM "Attachment"), 0) + COALESCE((SELECT sum("size") FROM "StatusImage"), 0))::float AS bytes`,
      prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
    ]);

  const r = retention[0] ?? { e7: 0, k7: 0, e30: 0, k30: 0 };
  const d = delivery[0] ?? { total: 0, delivered: 0, median_s: null, p95_s: null };
  const answered = calls.find((c) => c.status === "ENDED")?._count._all ?? 0;
  const missed = calls.find((c) => c.status === "MISSED")?._count._all ?? 0;
  const declined = calls.find((c) => c.status === "DECLINED")?._count._all ?? 0;
  const totalCalls = answered + missed + declined;
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
  const dbBytes = Number(dbSize[0]?.size ?? 0);
  const messagesToday = messageDays[messageDays.length - 1]?.n ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Indicateurs</h2>
        <p className="text-sm text-muted">
          Calculés à partir des données existantes, sans jamais lire le contenu des messages. Ils correspondent à la section 7 du
          document de proposition.
        </p>
      </div>

      <section aria-labelledby="m-activity">
        <h3 id="m-activity" className="mb-2 font-display text-lg font-semibold">Activité</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Actifs sur 24 h" value={dau} hint={`${pct(dau, users)} des comptes`} />
          <Stat label="Actifs sur 7 jours" value={wau} hint={`${pct(wau, users)} des comptes`} />
          <Stat label="Actifs sur 30 jours" value={mau} hint={`${pct(mau, users)} des comptes`} />
          <Stat label="Messages par actif (24 h)" value={dau > 0 ? (messagesToday / dau).toFixed(1).replace(".", ",") : "—"} />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Bars title="Inscriptions" data={signups} unit="inscription(s)" />
        <Bars title="Messages envoyés" data={messageDays.map((x) => ({ day: x.day, n: x.n }))} unit="message(s)" />
        <Bars title="Personnes qui ont écrit" data={messageDays.map((x) => ({ day: x.day, n: x.writers }))} unit="personne(s)" />
      </div>

      <section aria-labelledby="m-retention">
        <h3 id="m-retention" className="mb-2 font-display text-lg font-semibold">Rétention</h3>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Reviennent après 7 jours" value={pct(r.k7, r.e7)} hint={`${r.k7} sur ${r.e7} comptes de plus de 7 jours`} />
          <Stat label="Reviennent après 30 jours" value={pct(r.k30, r.e30)} hint={`${r.k30} sur ${r.e30} comptes de plus de 30 jours`} />
        </div>
      </section>

      <section aria-labelledby="m-reliab">
        <h3 id="m-reliab" className="mb-2 font-display text-lg font-semibold">Fiabilité (7 derniers jours)</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Messages remis" value={pct(d.delivered, d.total)} hint={`${d.delivered} sur ${d.total} réceptions`} />
          <Stat label="Délai de remise (médian)" value={duration(d.median_s)} hint="Inclut le temps où la personne était hors ligne" />
          <Stat label="Délai de remise (95 %)" value={duration(d.p95_s)} />
          <Stat label="Appels aboutis (30 j)" value={pct(answered, totalCalls)} hint={`${answered} abouti(s), ${missed} manqué(s), ${declined} refusé(s)`} />
        </div>
      </section>

      <section aria-labelledby="m-moderation">
        <h3 id="m-moderation" className="mb-2 font-display text-lg font-semibold">Modération</h3>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Signalements en attente" value={reportsOpen} />
          <Stat
            label="Délai moyen de traitement (30 j)"
            value={duration(reportTimes[0]?.avg_s)}
            hint={`${reportTimes[0]?.n ?? 0} signalement(s) traité(s)`}
          />
        </div>
      </section>

      <section aria-labelledby="m-cost">
        <h3 id="m-cost" className="mb-2 font-display text-lg font-semibold">Coût de stockage</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Base de données" value={mb(dbBytes)} hint="Limite de l'offre gratuite Neon : 512 Mo" />
          <Stat label="Photos, vocaux et fichiers" value={mb(attachments[0]?.bytes ?? 0)} />
          <Stat label="Stockage par compte actif (30 j)" value={mau > 0 ? mb(dbBytes / mau) : "—"} />
        </div>
      </section>

      <p className="rounded-2xl bg-panel p-4 text-sm text-muted shadow-sm">
        Non mesuré, volontairement : la satisfaction des utilisateurs (à recueillir par un moyen explicite et avec leur accord),
        les conversions Premium et le nombre d&apos;entreprises actives (ces offres n&apos;existent pas encore), et le coût de l&apos;IA
        (pas d&apos;IA branchée).
      </p>
    </div>
  );
}
