/** Vérifie que les premiers octets correspondent bien au type d'image annoncé */
export function matchesImageSignature(bytes: Uint8Array, mime: string) {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (mime) {
    case "image/jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47);
    case "image/gif":
      return startsWith(0x47, 0x49, 0x46, 0x38);
    case "image/webp":
      return startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45;
    default:
      return false;
  }
}

/** Vidéos acceptées pour les statuts : MP4 / MOV (« ftyp » aux octets 4 à 7) ou WebM (en-tête EBML) */
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export function matchesVideoSignature(bytes: Uint8Array, mime: string) {
  if (mime === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mime === "video/mp4" || mime === "video/quicktime") {
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70; // « ftyp »
  }
  return false;
}
