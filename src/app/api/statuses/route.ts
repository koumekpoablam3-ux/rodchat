import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { matchesImageSignature } from "@/lib/image-signature";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";
import { MAX_STATUS_CAPTION, MAX_STATUS_TEXT, STATUS_BACKGROUNDS, STATUS_TTL_MS } from "@/lib/status-palette";
import { notifyStatusChange, statusContactIds } from "@/lib/statuses";
import type { StatusFeed, StatusItem } from "@/types/status";

export const dynamic = "force-dynamic";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const optionalInt = (value: string | null, max: number) => {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null;
};

// Les statuts que je peux voir : les miens et ceux de mes contacts, encore valables (24 h)
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const contacts = await statusContactIds(userId);
  const rows = await prisma.status.findMany({
    where: { expiresAt: { gt: new Date() }, authorId: { in: [userId, ...contacts] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      authorId: true,
      type: true,
      text: true,
      background: true,
      createdAt: true,
      expiresAt: true,
      image: { select: { width: true, height: true } },
      views: { where: { userId }, select: { userId: true } },
      _count: { select: { views: true } },
      author: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  const feed: StatusFeed = { mine: [], groups: [] };
  const byAuthor = new Map<string, StatusFeed["groups"][number]>();

  for (const row of rows) {
    const mine = row.authorId === userId;
    const item: StatusItem = {
      id: row.id,
      type: row.type,
      text: row.text,
      background: row.background,
      imageUrl: row.type === "IMAGE" ? `/api/statuses/${row.id}/image` : null,
      width: row.image?.width ?? null,
      height: row.image?.height ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      viewed: mine || row.views.length > 0,
      ...(mine ? { viewCount: row._count.views } : {}),
    };
    if (mine) {
      feed.mine.push(item);
      continue;
    }
    let group = byAuthor.get(row.authorId);
    if (!group) {
      group = { user: row.author, items: [], unseen: 0, latestAt: item.createdAt };
      byAuthor.set(row.authorId, group);
    }
    group.items.push(item);
    if (!item.viewed) group.unseen += 1;
    group.latestAt = item.createdAt;
  }

  // Non vus d'abord, puis du plus récent au plus ancien
  feed.groups = Array.from(byAuthor.values()).sort(
    (a, b) => Number(b.unseen > 0) - Number(a.unseen > 0) || b.latestAt.localeCompare(a.latestAt),
  );
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}

const textSchema = z.object({
  text: z.string().trim().min(1, "Écris quelque chose.").max(MAX_STATUS_TEXT, "Ce statut est trop long."),
  background: z.number().int().min(0).max(STATUS_BACKGROUNDS.length - 1).default(0),
});

// Publier un statut : JSON pour un texte, ou le fichier brut pour une photo (métadonnées dans les en-têtes)
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`status:${userId}`, 30, 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Tu publies beaucoup de statuts. Patiente un peu." }, { status: 429 });
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const expiresAt = new Date(Date.now() + STATUS_TTL_MS);
  let id: string;

  if (contentType === "application/json") {
    const parsed = textSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);
    const status = await prisma.status.create({
      data: { authorId: userId, type: "TEXT", text: parsed.data.text, background: parsed.data.background, expiresAt },
      select: { id: true },
    });
    id = status.id;
  } else {
    if (!IMAGE_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "Format d'image non pris en charge. Utilise JPEG, PNG, WebP ou GIF." },
        { status: 415 },
      );
    }
    const tooLarge = () =>
      NextResponse.json({ error: `Cette photo dépasse la limite de ${MAX_UPLOAD_MB} Mo.` }, { status: 413 });
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) return tooLarge();

    const buffer = await req.arrayBuffer();
    if (buffer.byteLength === 0) return badRequest("La photo est vide.");
    if (buffer.byteLength > MAX_UPLOAD_BYTES) return tooLarge();
    const data = new Uint8Array(buffer);
    if (!matchesImageSignature(data, contentType)) return badRequest("Ce fichier n'est pas une image valide.");

    let caption = "";
    try {
      caption = decodeURIComponent(req.headers.get("x-caption") ?? "").trim().slice(0, MAX_STATUS_CAPTION);
    } catch {
      /* légende illisible : on la laisse vide */
    }

    const status = await prisma.status.create({
      data: {
        authorId: userId,
        type: "IMAGE",
        text: caption || null,
        expiresAt,
        image: {
          create: {
            mimeType: contentType,
            size: data.byteLength,
            width: optionalInt(req.headers.get("x-width"), 20_000),
            height: optionalInt(req.headers.get("x-height"), 20_000),
            data,
          },
        },
      },
      select: { id: true },
    });
    id = status.id;
  }

  await notifyStatusChange(userId);
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
