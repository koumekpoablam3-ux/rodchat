// Taille maximale d'un fichier envoyé. Tout est stocké dans PostgreSQL :
// garde cette valeur raisonnable pour ne pas remplir la base trop vite.
// NEXT_PUBLIC_ : la même valeur sert au navigateur (vérification avant envoi) et au serveur.
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const MAX_VOICE_SECONDS = 10 * 60;

/** Images affichées directement dans la discussion (le SVG est exclu : il peut contenir du code) */
export const INLINE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const MAX_MESSAGE_LENGTH = 4000;

// --- Messages ---

/** Un message texte se modifie pendant 15 minutes */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
/** « Supprimer pour tous » reste possible pendant 48 heures */
export const DELETE_FOR_ALL_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Réactions proposées (une seule par personne et par message) */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "🔥"];
/** Nombre maximal de discussions où un message peut être transféré d'un coup */
export const MAX_FORWARD_TARGETS = 5;

// --- Discussions ---

export const MAX_PINNED_CONVERSATIONS = 3;
export const MAX_GROUP_MEMBERS = 256;
export const MAX_GROUP_NAME = 60;
export const MAX_GROUP_DESCRIPTION = 300;
export const MAX_DISPLAY_NAME = 50;
export const MAX_ABOUT = 140;

/** Photos de profil et de groupe : réduites dans le navigateur, plafonnées ici côté serveur */
export const MAX_AVATAR_BYTES = 1024 * 1024;

/** Durées proposées pour les messages éphémères (en secondes) */
export const DISAPPEARING_OPTIONS: { seconds: number | null; label: string }[] = [
  { seconds: null, label: "Désactivés" },
  { seconds: 24 * 60 * 60, label: "24 heures" },
  { seconds: 7 * 24 * 60 * 60, label: "7 jours" },
  { seconds: 90 * 24 * 60 * 60, label: "90 jours" },
];

export function disappearingLabel(seconds: number | null) {
  return DISAPPEARING_OPTIONS.find((o) => o.seconds === seconds)?.label ?? "Activés";
}

/** Durées de sourdine proposées. « Toujours » = une date très lointaine. */
export const FOREVER_ISO = "2100-01-01T00:00:00.000Z";
export const MUTE_OPTIONS: { id: string; label: string; ms: number | null }[] = [
  { id: "8h", label: "8 heures", ms: 8 * 60 * 60 * 1000 },
  { id: "1w", label: "1 semaine", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "always", label: "Toujours", ms: null },
];

// --- Appels ---

/** Appels de groupe : connexion directe entre chaque paire, au-delà de 6 la qualité s'effondre */
export const MAX_GROUP_CALL_PEOPLE = 6;
