import { prisma } from "./prisma";
import { getSetting, setSetting } from "./settings";

// Gestion de l'espace de stockage (photos, vidéos, vocaux et fichiers sont stockés dans la base Neon).
//
// « Supprimer » un fichier ne supprime pas le message : ses octets sont vidés et il est marqué `purgedAt`.
// Dans la discussion, le message reste avec la mention « Fichier supprimé pour libérer de l'espace ».
// Les médias épinglés ou mis en favoris sont toujours conservés par les nettoyages en masse.
//
// Important, côté Neon : PostgreSQL réutilise l'espace libéré pour les nouveaux fichiers, mais la taille du fichier de
// base ne rétrécit pas toujours tout de suite. C'est pourquoi le nettoyage automatique se fie à la quantité de médias
// « vivants » (non supprimés), pas à la taille brute de la base.

const MB = 1024 * 1024;

export const quotaBytes = () => (Number(process.env.STORAGE_QUOTA_MB) || 512) * MB;
/** Part de l'espace réservée aux médias (le reste sert aux messages, index, historique) : 70 % par défaut */
export const mediaBudgetBytes = () =>
  (Number(process.env.STORAGE_MEDIA_BUDGET_MB) || Math.round((Number(process.env.STORAGE_QUOTA_MB) || 512) * 0.7)) * MB;

export type MediaType = "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
export const MEDIA_TYPES: MediaType[] = ["IMAGE", "VIDEO", "AUDIO", "FILE"];

export type PurgeFilter = {
  types: MediaType[];
  /** 0 = sans limite d'âge */
  olderThanDays: number;
  minSizeBytes: number;
};

// --- Mesures ---

export async function storageStats() {
  const [db, byType, statusMedia, purged] = await Promise.all([
    prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
    prisma.$queryRaw<{ type: string; n: number; bytes: number }[]>`
      SELECT m."type"::text AS type, count(*)::int AS n, COALESCE(sum(a."size"), 0)::float AS bytes
      FROM "Attachment" a JOIN "Message" m ON m."id" = a."messageId"
      WHERE a."purgedAt" IS NULL GROUP BY m."type"`,
    prisma.$queryRaw<{ n: number; bytes: number }[]>`
      SELECT count(*)::int AS n, COALESCE(sum("size"), 0)::float AS bytes FROM "StatusImage"`,
    prisma.$queryRaw<{ n: number; bytes: number }[]>`
      SELECT count(*)::int AS n, COALESCE(sum("size"), 0)::float AS bytes FROM "Attachment" WHERE "purgedAt" IS NOT NULL`,
  ]);

  const dbBytes = Number(db[0]?.size ?? 0);
  const liveMediaBytes = byType.reduce((sum, row) => sum + row.bytes, 0) + (statusMedia[0]?.bytes ?? 0);
  return {
    dbBytes,
    liveMediaBytes,
    quotaBytes: quotaBytes(),
    budgetBytes: mediaBudgetBytes(),
    byType,
    statusMedia: statusMedia[0] ?? { n: 0, bytes: 0 },
    purged: purged[0] ?? { n: 0, bytes: 0 },
  };
}

/** Les plus gros fichiers encore présents : type, taille, date, auteur, lieu. Jamais leur contenu ni leur nom. */
export async function biggestFiles(limit = 25) {
  return prisma.$queryRaw<
    { id: string; size: number; type: string; createdAt: Date; sender: string; isGroup: boolean; groupName: string | null }[]
  >`
    SELECT a."id", a."size"::int AS size, m."type"::text AS type, m."createdAt", u."displayName" AS sender,
           c."isGroup" AS "isGroup", c."name" AS "groupName"
    FROM "Attachment" a
    JOIN "Message" m ON m."id" = a."messageId"
    JOIN "User" u ON u."id" = m."senderId"
    JOIN "Conversation" c ON c."id" = m."conversationId"
    WHERE a."purgedAt" IS NULL
    ORDER BY a."size" DESC
    LIMIT ${limit}`;
}

// --- Suppression ---

/** Combien de fichiers et d'octets un nettoyage avec ces critères libérerait-il ? */
export async function previewPurge(filter: PurgeFilter) {
  const rows = await prisma.$queryRaw<{ n: number; bytes: number }[]>`
    SELECT count(*)::int AS n, COALESCE(sum(a."size"), 0)::float AS bytes
    FROM "Attachment" a JOIN "Message" m ON m."id" = a."messageId"
    WHERE a."purgedAt" IS NULL
      AND m."type"::text = ANY(${filter.types})
      AND m."createdAt" < (now() AT TIME ZONE 'UTC') - make_interval(days => ${filter.olderThanDays}::int)
      AND a."size" >= ${filter.minSizeBytes}::int
      AND m."pinnedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "StarredMessage" s WHERE s."messageId" = m."id")`;
  return rows[0] ?? { n: 0, bytes: 0 };
}

/** Vide les fichiers correspondant aux critères (par lots, pour rester dans les limites d'une fonction) */
export async function runPurge(filter: PurgeFilter) {
  let count = 0;
  let bytes = 0;
  for (let round = 0; round < 6; round += 1) {
    const done = await prisma.$queryRaw<{ size: number }[]>`
      UPDATE "Attachment" SET "data" = ''::bytea, "purgedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "id" IN (
        SELECT a."id" FROM "Attachment" a JOIN "Message" m ON m."id" = a."messageId"
        WHERE a."purgedAt" IS NULL
          AND m."type"::text = ANY(${filter.types})
          AND m."createdAt" < (now() AT TIME ZONE 'UTC') - make_interval(days => ${filter.olderThanDays}::int)
          AND a."size" >= ${filter.minSizeBytes}::int
          AND m."pinnedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "StarredMessage" s WHERE s."messageId" = m."id")
        LIMIT 500
      )
      RETURNING "size"::int AS size`;
    if (done.length === 0) break;
    count += done.length;
    bytes += done.reduce((sum, row) => sum + row.size, 0);
  }
  await reclaimSpace();
  return { count, bytes };
}

/** Supprime un fichier précis (sans les protections des nettoyages en masse : c'est un choix explicite) */
export async function purgeOne(attachmentId: string) {
  const done = await prisma.$queryRaw<{ size: number }[]>`
    UPDATE "Attachment" SET "data" = ''::bytea, "purgedAt" = (now() AT TIME ZONE 'UTC')
    WHERE "id" = ${attachmentId} AND "purgedAt" IS NULL RETURNING "size"::int AS size`;
  if (done.length > 0) await reclaimSpace();
  return { count: done.length, bytes: done[0]?.size ?? 0 };
}

/** Demande à PostgreSQL de rendre réutilisable l'espace des octets vidés (sans bloquer personne) */
async function reclaimSpace() {
  try {
    await prisma.$executeRawUnsafe('VACUUM "Attachment"');
  } catch (error) {
    // Pas grave : l'autovacuum de PostgreSQL le fera un peu plus tard
    console.error("[storage] VACUUM impossible :", error instanceof Error ? error.message : error);
  }
}

// --- Nettoyage automatique ---

export type AutoCleanupResult = {
  at: string;
  emergency: boolean;
  count: number;
  freedBytes: number;
  liveMediaBefore: number;
  note: string;
};

const CHECK_KEY = "storage_auto_check";
const LAST_KEY = "storage_last_auto";
const CHECK_EVERY_MS = 5 * 60 * 1000;

export async function lastAutoCleanup(): Promise<AutoCleanupResult | null> {
  const raw = await getSetting(LAST_KEY);
  try {
    return raw ? (JSON.parse(raw) as AutoCleanupResult) : null;
  } catch {
    return null;
  }
}

/**
 * Libère de l'espace tout seul quand les médias remplissent leur part de l'espace, sans attendre l'administrateur.
 * - Déclenchement : médias vivants ≥ 90 % de leur budget (ou base ≥ 95 % de l'espace total : urgence).
 * - Action : supprime les médias les plus anciens, jamais ceux des 7 derniers jours (1 jour en urgence), jamais
 *   les médias épinglés ou en favoris, jusqu'à repasser sous 75 % du budget (60 % en urgence).
 * Appelée après les envois de fichiers, et par la tâche quotidienne. Au plus une vérification toutes les 5 minutes.
 */
export async function maybeAutoCleanup(options: { force?: boolean } = {}): Promise<AutoCleanupResult | null> {
  if (!options.force) {
    await prisma.setting.createMany({ data: [{ key: CHECK_KEY, value: "0" }], skipDuplicates: true });
    const claim = await prisma.setting.updateMany({
      where: { key: CHECK_KEY, updatedAt: { lt: new Date(Date.now() - CHECK_EVERY_MS) } },
      data: { value: String(Date.now()) },
    });
    if (claim.count === 0) return null; // vérifié il y a moins de 5 minutes, ou en cours dans une autre fonction
  }

  const stats = await storageStats();
  const budget = stats.budgetBytes;
  const emergency = stats.dbBytes >= stats.quotaBytes * 0.95;
  const triggered = stats.liveMediaBytes >= budget * 0.9 || emergency;
  if (!triggered) return null;

  const targetBytes = budget * (emergency ? 0.6 : 0.75);
  const needed = stats.liveMediaBytes - targetBytes;
  const minAgeDays = emergency ? 1 : 7;

  let freed = 0;
  let count = 0;
  if (needed > 0) {
    // Les plus anciens d'abord, en laissant de côté les récents, les épinglés et les favoris
    const candidates = await prisma.$queryRaw<{ id: string; size: number }[]>`
      SELECT a."id", a."size"::int AS size
      FROM "Attachment" a JOIN "Message" m ON m."id" = a."messageId"
      WHERE a."purgedAt" IS NULL
        AND m."createdAt" < (now() AT TIME ZONE 'UTC') - make_interval(days => ${minAgeDays}::int)
        AND m."pinnedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "StarredMessage" s WHERE s."messageId" = m."id")
      ORDER BY m."createdAt" ASC
      LIMIT 3000`;

    const ids: string[] = [];
    for (const candidate of candidates) {
      if (freed >= needed) break;
      ids.push(candidate.id);
      freed += candidate.size;
    }
    if (ids.length > 0) {
      await prisma.$executeRaw`
        UPDATE "Attachment" SET "data" = ''::bytea, "purgedAt" = (now() AT TIME ZONE 'UTC')
        WHERE "id" = ANY(${ids}) AND "purgedAt" IS NULL`;
      count = ids.length;
      await reclaimSpace();
    }
  }

  const reached = freed >= needed;
  const result: AutoCleanupResult = {
    at: new Date().toISOString(),
    emergency,
    count,
    freedBytes: freed,
    liveMediaBefore: stats.liveMediaBytes,
    note: reached
      ? "Espace libéré : les médias les plus anciens ont été supprimés."
      : "Pas assez de médias anciens à supprimer : l'espace reste presque plein. Une intervention de l'administrateur est nécessaire.",
  };
  await setSetting(LAST_KEY, JSON.stringify(result));
  await prisma.adminLog.create({
    data: {
      adminId: "system",
      adminName: "Nettoyage automatique",
      action: emergency ? "Libération d'espace (urgence)" : "Libération d'espace",
      details: `${count} fichier(s) supprimé(s), ${(freed / MB).toFixed(1)} Mo libérés. ${result.note}`,
    },
  });
  return result;
}
