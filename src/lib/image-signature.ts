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
