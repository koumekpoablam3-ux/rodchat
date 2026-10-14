import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdmin, requireAdmin } from "@/lib/admin";
import { badRequest } from "@/lib/api";
import { maybeAutoCleanup, previewPurge, purgeOne, runPurge, type PurgeFilter } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const criteria = {
  types: z.array(z.enum(["IMAGE", "VIDEO", "AUDIO", "FILE"])).min(1, "Choisis au moins un type de fichier."),
  olderThanDays: z.number().int().min(0).max(3650),
  minSizeMb: z.number().min(0).max(100),
};

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), ...criteria }),
  z.object({ action: z.literal("purge"), ...criteria }),
  z.object({ action: z.literal("delete-one"), id: z.string().min(1).max(40) }),
  z.object({ action: z.literal("auto") }),
]);

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

// Gestion du stockage : estimer, supprimer des fichiers (par critères ou un par un), lancer le nettoyage automatique
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Requête invalide.");
  const body = parsed.data;

  if (body.action === "preview" || body.action === "purge") {
    const filter: PurgeFilter = {
      types: body.types,
      olderThanDays: body.olderThanDays,
      minSizeBytes: Math.round(body.minSizeMb * 1024 * 1024),
    };
    if (body.action === "preview") return NextResponse.json({ ok: true, ...(await previewPurge(filter)) });

    const done = await runPurge(filter);
    await logAdmin(
      admin,
      "Fichiers supprimés (stockage)",
      undefined,
      `${done.count} fichier(s), ${mb(done.bytes)} libérés · types ${body.types.join(", ")} · plus de ${body.olderThanDays} j · ≥ ${body.minSizeMb} Mo`,
    );
    return NextResponse.json({ ok: true, ...done });
  }

  if (body.action === "delete-one") {
    const done = await purgeOne(body.id);
    if (done.count > 0) await logAdmin(admin, "Fichier supprimé (stockage)", { id: body.id }, mb(done.bytes));
    return NextResponse.json({ ok: true, ...done });
  }

  // « auto » : même logique que le nettoyage automatique, lancée à la demande
  const result = await maybeAutoCleanup({ force: true });
  return NextResponse.json({ ok: true, result });
}
