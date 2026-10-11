import { NextResponse } from "next/server";
import { forbidden, notFound, unauthorized } from "@/lib/api";
import { INLINE_IMAGE_TYPES } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// Lecture d'un fichier stocké en base. Seuls les participants de la discussion y ont accès.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const attachment = await prisma.attachment.findUnique({
    where: { id: params.id },
    select: {
      fileName: true,
      mimeType: true,
      size: true,
      data: true,
      message: { select: { conversationId: true, type: true } },
    },
  });
  if (!attachment) return notFound("Ce fichier n'existe plus.");

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: attachment.message.conversationId } },
    select: { id: true },
  });
  if (!member) return forbidden();

  // Affichage direct seulement pour les médias attendus ; le reste est toujours téléchargé
  const { type } = attachment.message;
  const inline =
    (type === "IMAGE" && INLINE_IMAGE_TYPES.includes(attachment.mimeType)) ||
    (type === "AUDIO" && attachment.mimeType.startsWith("audio/")) ||
    (type === "VIDEO" && attachment.mimeType.startsWith("video/"));

  const asciiName = attachment.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": inline ? attachment.mimeType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };

  const bytes = new Uint8Array(attachment.data);
  const total = bytes.byteLength;

  // Safari exige les requêtes partielles (Range) pour lire l'audio et la vidéo
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
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(chunk.byteLength),
      },
    });
  }

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: { ...headers, "Content-Length": String(total) },
  });
}
