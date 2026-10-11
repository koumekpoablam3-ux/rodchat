import { NextResponse } from "next/server";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { matchesImageSignature } from "@/lib/image-signature";
import { rateLimit } from "@/lib/rate-limit";
import { safeFetch } from "@/lib/safe-fetch";
import { getSessionUserId } from "@/lib/session";

const MAX_IMAGE_BYTES = 1024 * 1024;

// Image d'un aperçu de lien, servie par notre serveur : le navigateur ne contacte jamais le site visité
// (il ne voit ni ton adresse IP ni ta présence dans la discussion).
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!rateLimit(`preview-image:${userId}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Trop de requêtes. Patiente un instant." }, { status: 429 });
  }

  const target = new URL(req.url).searchParams.get("u") ?? "";
  if (!target || target.length > 2000) return badRequest("Adresse invalide.");

  const response = await safeFetch(target, {
    maxBytes: MAX_IMAGE_BYTES,
    accept: "image/jpeg,image/png,image/webp,image/gif",
    types: /^image\/(jpeg|png|webp|gif)/i,
    allowTruncate: false,
  });
  if (!response) return notFound("Image indisponible.");

  const mimeType = response.contentType.split(";")[0].trim().toLowerCase();
  const bytes = new Uint8Array(response.body);
  if (!matchesImageSignature(bytes, mimeType)) return notFound("Image indisponible.");

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
