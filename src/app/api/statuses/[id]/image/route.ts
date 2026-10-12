import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { canSeeStatusesOf } from "@/lib/statuses";

export const dynamic = "force-dynamic";

// Photo d'un statut : l'auteur et ses contacts, tant que le statut n'a pas expiré
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const status = await prisma.status.findFirst({
    where: { id: params.id, expiresAt: { gt: new Date() } },
    select: { authorId: true, image: { select: { mimeType: true, data: true } } },
  });
  if (!status?.image || !(await canSeeStatusesOf(userId, status.authorId))) return notFound("Cette photo n'existe plus.");

  const bytes = new Uint8Array(status.image.data);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": status.image.mimeType,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
