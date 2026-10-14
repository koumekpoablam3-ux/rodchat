import StorageTools from "@/components/admin/StorageTools";
import { biggestFiles, lastAutoCleanup, storageStats } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
const TYPE_LABELS: Record<string, string> = { IMAGE: "Photos", VIDEO: "Vidéos", AUDIO: "Vocaux", FILE: "Documents" };

function Meter({ label, used, total, hint }: { label: string; used: number; total: number; hint: string }) {
  const percent = Math.min(100, Math.round((used / total) * 100));
  return (
    <section className="rounded-2xl bg-panel p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{label}</h3>
        <p className="text-sm font-semibold">
          {mb(used)} / {mb(total)}
        </p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full ${percent >= 90 ? "bg-danger" : percent >= 75 ? "bg-accent" : "bg-brand"}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {percent} % · {hint}
      </p>
    </section>
  );
}

export default async function AdminStorage() {
  const [stats, biggest, last] = await Promise.all([storageStats(), biggestFiles(25), lastAutoCleanup()]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Stockage</h2>
        <p className="text-sm text-muted">
          Photos, vidéos, vocaux et fichiers sont enregistrés dans la base de données Neon, dont l&apos;espace est limité.
        </p>
      </div>

      <Meter label="Médias en ligne" used={stats.liveMediaBytes} total={stats.budgetBytes} hint="Le nettoyage automatique se déclenche à 90 %." />
      <Meter label="Base de données (taille totale)" used={stats.dbBytes} total={stats.quotaBytes} hint="Messages, index et historique inclus." />

      <p className="rounded-2xl bg-panel p-4 text-sm text-muted shadow-sm">
        Après une suppression, PostgreSQL réutilise l&apos;espace libéré pour les nouveaux fichiers, mais la taille totale de la
        base peut ne pas redescendre tout de suite : c&apos;est le chiffre « Médias en ligne » qui montre le gain réel.
      </p>

      {last ? (
        <section className={`rounded-2xl p-4 shadow-sm ${last.emergency || last.note.startsWith("Pas assez") ? "bg-danger/10" : "bg-panel"}`}>
          <h3 className="font-display text-lg font-semibold">Dernier nettoyage automatique</h3>
          <p className="text-sm">
            {new Date(last.at).toLocaleString("fr-FR")} · {last.count} fichier(s), {mb(last.freedBytes)} libérés
            {last.emergency ? " · mode urgence" : ""}
          </p>
          <p className="text-sm text-muted">{last.note}</p>
        </section>
      ) : null}

      <section className="rounded-2xl bg-panel p-4 shadow-sm">
        <h3 className="mb-2 font-display text-lg font-semibold">Ce qui est stocké</h3>
        <ul className="divide-y divide-line text-sm">
          {["IMAGE", "VIDEO", "AUDIO", "FILE"].map((type) => {
            const row = stats.byType.find((r) => r.type === type);
            return (
              <li key={type} className="flex justify-between py-2">
                <span>{TYPE_LABELS[type]}</span>
                <span className="text-muted">
                  {row?.n ?? 0} fichier{(row?.n ?? 0) > 1 ? "s" : ""} · {mb(row?.bytes ?? 0)}
                </span>
              </li>
            );
          })}
          <li className="flex justify-between py-2">
            <span>Médias des statuts (24 h)</span>
            <span className="text-muted">
              {stats.statusMedia.n} · {mb(stats.statusMedia.bytes)}
            </span>
          </li>
          <li className="flex justify-between py-2">
            <span>Déjà supprimés (messages gardés)</span>
            <span className="text-muted">{stats.purged.n} fichier{stats.purged.n > 1 ? "s" : ""}</span>
          </li>
        </ul>
      </section>

      <StorageTools
        biggest={biggest.map((file) => ({
          id: file.id,
          size: file.size,
          type: file.type,
          createdAt: new Date(file.createdAt).toISOString(),
          sender: file.sender,
          place: file.isGroup ? `groupe « ${file.groupName ?? "sans nom"} »` : "discussion à deux",
        }))}
      />
    </div>
  );
}
