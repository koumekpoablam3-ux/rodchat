import { NextResponse } from "next/server";
import { badRequest, forbidden, unauthorized } from "@/lib/api";
import { matchesImageSignature } from "@/lib/image-signature";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/limits";
import { postMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { BlockedError, blockedMessage } from "@/lib/blocks";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";
import type { AttachmentType } from "@/types/chat";

const TYPES: AttachmentType[] = ["IMAGE", "AUDIO", "VIDEO", "FILE"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const cleanName = (raw: string) =>
  raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\]/g, "")
    .trim()
    .slice(0, 120) || "fichier";

const optionalInt = (value: string | null, max: number) => {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null;
};

// Le corps de la requête est le fichier brut ; ses métadonnées voyagent dans les en-têtes.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const conversationId = params.id;
  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    select: { id: true },
  });
  if (!member) return forbidden();

  const limit = await rateLimitShared(`upload:${userId}`, 40, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Tu envoies beaucoup de fichiers. Patiente un peu avant de réessayer." },
      { status: 429 },
    );
  }

  const tooLarge = () =>
    NextResponse.json({ error: `Ce fichier dépasse la limite de ${MAX_UPLOAD_MB} Mo.` }, { status: 413 });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) return tooLarge();

  const type = req.headers.get("x-message-type") as AttachmentType | null;
  if (!type || !TYPES.includes(type)) return badRequest("Type de fichier non pris en charge.");

  // « audio/webm;codecs=opus » -> « audio/webm »
  const mimeType = (req.headers.get("content-type") ?? "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (type === "IMAGE" && !IMAGE_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: "Format d'image non pris en charge. Utilise JPEG, PNG, WebP ou GIF." },
      { status: 415 },
    );
  }
  if (type === "AUDIO" && !mimeType.startsWith("audio/")) return badRequest("Ce n'est pas un fichier audio.");
  if (type === "VIDEO" && !mimeType.startsWith("video/")) return badRequest("Ce n'est pas une vidéo.");

  const buffer = await req.arrayBuffer();
  if (buffer.byteLength === 0) return badRequest("Le fichier est vide.");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) return tooLarge();

  const data = new Uint8Array(buffer);
  if (type === "IMAGE" && !matchesImageSignature(data, mimeType)) {
    return badRequest("Ce fichier n'est pas une image valide.");
  }

  let fileName = "fichier";
  try {
    fileName = cleanName(decodeURIComponent(req.headers.get("x-file-name") ?? ""));
  } catch {
    /* nom illisible : on garde le nom par défaut */
  }

  const clientIdHeader = req.headers.get("x-client-id");
  const clientId = clientIdHeader && clientIdHeader.length <= 64 ? clientIdHeader : undefined;

  const replyHeader = req.headers.get("x-reply-to");
  const replyToId = replyHeader && replyHeader.length <= 40 ? replyHeader : undefined;

  try {
    const message = await postMessage({
      senderId: userId,
      conversationId,
      type,
      clientId,
      replyToId,
      attachment: {
        fileName,
        mimeType,
        size: data.byteLength,
        durationMs: type === "AUDIO" ? optionalInt(req.headers.get("x-duration-ms"), 3_600_000) : null,
        width: type === "IMAGE" ? optionalInt(req.headers.get("x-width"), 20_000) : null,
        height: type === "IMAGE" ? optionalInt(req.headers.get("x-height"), 20_000) : null,
        data,
      },
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof BlockedError) return NextResponse.json({ error: blockedMessage(error.byMe) }, { status: 403 });
    throw error;
  }
}
