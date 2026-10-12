import { prisma } from "./prisma";

// Deux limiteurs :
//  - rateLimit : en mémoire de la fonction, instantané mais propre à chaque instance Vercel. Pour les usages fréquents.
//  - rateLimitShared : compteur dans Neon, valable pour toutes les instances. Pour ce qui doit vraiment être borné
//    (connexion, inscription, envois de fichiers) : sans lui, un attaquant répartit ses essais sur plusieurs instances.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();

  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }

  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Limiteur partagé (Neon). Si la base ne répond pas, retombe sur le limiteur en mémoire plutôt que de bloquer tout le monde. */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  const secs = Math.max(1, Math.round(windowMs / 1000));
  try {
    const rows = await prisma.$queryRaw<{ count: number; retry: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${secs}::double precision))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= (now() AT TIME ZONE 'UTC')
          THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => ${secs}::double precision)
          ELSE "RateLimit"."resetAt" END
      RETURNING "count", EXTRACT(EPOCH FROM ("resetAt" - (now() AT TIME ZONE 'UTC')))::int AS "retry"`;
    const row = rows[0];
    if (!row) return rateLimit(key, limit, windowMs);
    return row.count > limit ? { ok: false, retryAfter: Math.max(1, row.retry) } : { ok: true, retryAfter: 0 };
  } catch (error) {
    console.error("[rate-limit]", error instanceof Error ? error.message : error);
    return rateLimit(key, limit, windowMs);
  }
}
