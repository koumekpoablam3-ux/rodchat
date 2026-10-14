import { isDataSaverOn } from "@/hooks/useDataSaver";

const MAX_SIDE = 1600;
/** Économie de données : photos plus petites et plus compressées */
const SAVER_SIDE = 1024;
const SAVER_QUALITY = 0.68;

export type PreparedImage = {
  blob: Blob;
  fileName: string;
  width: number | null;
  height: number | null;
};

/**
 * Réduit une photo avant l'envoi (1600 px maximum, JPEG) : une photo de téléphone passe
 * de plusieurs Mo à quelques centaines de Ko, ce qui ménage la base de données et le forfait.
 * Les GIF animés restent tels quels.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bitmap;

    if (file.type === "image/gif") {
      bitmap.close();
      return { blob: file, fileName: file.name, width, height };
    }

    const saver = isDataSaverOn();
    const scale = Math.min(1, (saver ? SAVER_SIDE : MAX_SIDE) / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas indisponible");
    // Fond blanc : les PNG transparents ne deviennent pas noirs en JPEG
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", saver ? SAVER_QUALITY : 0.82));
    if (!blob) throw new Error("compression impossible");

    // Si la compression n'apporte rien, on garde l'original
    if (file.type === "image/jpeg" && blob.size >= file.size && scale === 1 && !saver) {
      return { blob: file, fileName: file.name, width: targetWidth, height: targetHeight };
    }
    return { blob, fileName: `${baseName}.jpg`, width: targetWidth, height: targetHeight };
  } catch {
    // Format que le navigateur ne sait pas décoder : on envoie le fichier brut, le serveur tranchera
    return { blob: file, fileName: file.name, width: null, height: null };
  }
}

const AVATAR_SIDE = 384;

/**
 * Prépare une photo de profil ou de groupe : recadrée en carré au centre, réduite à 384 px, en JPEG.
 * Renvoie null si le navigateur ne sait pas lire l'image.
 */
export async function prepareAvatar(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.round((bitmap.width - side) / 2);
    const sy = Math.round((bitmap.height - side) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIDE;
    canvas.height = AVATAR_SIDE;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE);
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
    bitmap.close();

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}
