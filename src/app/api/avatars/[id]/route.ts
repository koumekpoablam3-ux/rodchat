import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// Lecture d'une photo de profil ou de groupe. Réservée aux personnes connectées.
// Chaque changement de photo crée une nouvelle adresse : le navigateur peut la garder un an.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const image = await prisma.avatarImage.findUnique({
    where: { id: params.id },
    select: { mimeType: true, data: true },
  });
  if (!image) return notFound("Cette photo n'existe plus.");

  const bytes = new Uint8Array(image.data);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
