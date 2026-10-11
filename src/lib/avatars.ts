import { MAX_AVATAR_BYTES } from "./limits";
import { matchesImageSignature } from "./image-signature";
import { prisma } from "./prisma";

const AVATAR_PREFIX = "/api/avatars/";
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type AvatarUpload = { ok: true; mimeType: string; data: Uint8Array<ArrayBuffer> } | { ok: false; error: string };

/** Lit et vérifie une photo envoyée en corps de requête brut */
export async function readAvatarUpload(req: Request): Promise<AvatarUpload> {
  const mimeType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!AVATAR_TYPES.includes(mimeType)) {
    return { ok: false, error: "Format d'image non pris en charge. Utilise JPEG, PNG ou WebP." };
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Cette photo est trop lourde (1 Mo maximum)." };
  }

  const buffer = await req.arrayBuffer();
  if (buffer.byteLength === 0) return { ok: false, error: "La photo est vide." };
  if (buffer.byteLength > MAX_AVATAR_BYTES) return { ok: false, error: "Cette photo est trop lourde (1 Mo maximum)." };

  const data = new Uint8Array(buffer);
  if (!matchesImageSignature(data, mimeType)) return { ok: false, error: "Ce fichier n'est pas une image valide." };
  return { ok: true, mimeType, data };
}

/** Enregistre la photo et renvoie son adresse */
export async function saveAvatar(upload: { mimeType: string; data: Uint8Array<ArrayBuffer> }) {
  const image = await prisma.avatarImage.create({
    data: { mimeType: upload.mimeType, data: upload.data },
    select: { id: true },
  });
  return `${AVATAR_PREFIX}${image.id}`;
}

/** Supprime la photo ancienne une fois remplacée (sans effet si l'adresse n'est pas une de nos photos) */
export async function deleteAvatarByUrl(url: string | null) {
  if (!url?.startsWith(AVATAR_PREFIX)) return;
  await prisma.avatarImage.deleteMany({ where: { id: url.slice(AVATAR_PREFIX.length) } });
}
