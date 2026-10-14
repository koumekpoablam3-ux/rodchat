import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { canSeeStatusesOf } from "@/lib/statuses";

export const dynamic = "force-dynamic";

// Photo ou vidéo d'un statut : l'auteur et ses contacts, tant que le statut n'a pas expiré
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const status = await prisma.status.findFirst({
    where: { id: params.id, expiresAt: { gt: new Date() } },
    select: { authorId: true, image: { select: { mimeType: true, data: true } } },
  });
  if (!status?.image || !(await canSeeStatusesOf(userId, status.authorId))) return notFound("Ce média n'existe plus.");

  const bytes = new Uint8Array(status.image.data);
  const total = bytes.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": status.image.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=86400, immutable",
    "Accept-Ranges": "bytes",
  };

  // Safari exige les requêtes partielles (Range) pour lire une vidéo
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] !== "" || range[2] !== "")) {
    let start = range[1] === "" ? total - Number(range[2]) : Number(range[1]);
    let end = range[1] === "" || range[2] === "" ? total - 1 : Number(range[2]);
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end || start >= total) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    const chunk = bytes.subarray(start, end + 1);
    return new NextResponse(chunk as unknown as BodyInit, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.byteLength) },
    });
  }

  return new NextResponse(bytes as unknown as BodyInit, { headers: { ...headers, "Content-Length": String(total) } });
}
