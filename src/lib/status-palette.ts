// Couleurs de fond des statuts texte (dégradé + couleur du texte), choisies pour rester lisibles.
export const STATUS_BACKGROUNDS: { from: string; to: string; ink: string }[] = [
  { from: "#2B1D44", to: "#5B3FA0", ink: "#FFFFFF" },
  { from: "#F5B335", to: "#F08A24", ink: "#2B1D44" },
  { from: "#0F766E", to: "#14B8A6", ink: "#FFFFFF" },
  { from: "#BE123C", to: "#F43F5E", ink: "#FFFFFF" },
  { from: "#1D4ED8", to: "#38BDF8", ink: "#FFFFFF" },
  { from: "#3F6212", to: "#84CC16", ink: "#FFFFFF" },
  { from: "#7E22CE", to: "#D946EF", ink: "#FFFFFF" },
  { from: "#111827", to: "#374151", ink: "#FFFFFF" },
];

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_STATUS_TEXT = 700;
export const MAX_STATUS_CAPTION = 200;

/** Durée maximale d'une vidéo de statut (le fichier doit aussi rester sous la limite d'envoi) */
export const MAX_STATUS_VIDEO_SECONDS = 30;
export const STATUS_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
