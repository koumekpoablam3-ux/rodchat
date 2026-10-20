// Numéros de téléphone : saisie, normalisation au format international (E.164, ex. +2250712345678) et affichage.
// Fichier sans dépendance, utilisé aussi bien par le navigateur que par le serveur.

export type Country = {
  iso: string;
  name: string;
  /** Indicatif international, sans « + » */
  dial: string;
  /** Le « 0 » de tête d'un numéro national disparaît en format international (France, Ghana, Nigéria…) */
  dropZero: boolean;
};

/** Pays proposés à l'inscription (Afrique de l'Ouest et centrale d'abord) */
export const COUNTRIES: Country[] = [
  { iso: "CI", name: "Côte d'Ivoire", dial: "225", dropZero: false },
  { iso: "TG", name: "Togo", dial: "228", dropZero: false },
  { iso: "BJ", name: "Bénin", dial: "229", dropZero: false },
  { iso: "BF", name: "Burkina Faso", dial: "226", dropZero: false },
  { iso: "SN", name: "Sénégal", dial: "221", dropZero: false },
  { iso: "ML", name: "Mali", dial: "223", dropZero: false },
  { iso: "NE", name: "Niger", dial: "227", dropZero: false },
  { iso: "GN", name: "Guinée", dial: "224", dropZero: false },
  { iso: "GH", name: "Ghana", dial: "233", dropZero: true },
  { iso: "NG", name: "Nigéria", dial: "234", dropZero: true },
  { iso: "CM", name: "Cameroun", dial: "237", dropZero: false },
  { iso: "GA", name: "Gabon", dial: "241", dropZero: false },
  { iso: "CG", name: "Congo", dial: "242", dropZero: false },
  { iso: "CD", name: "RD Congo", dial: "243", dropZero: true },
  { iso: "MA", name: "Maroc", dial: "212", dropZero: true },
  { iso: "DZ", name: "Algérie", dial: "213", dropZero: true },
  { iso: "TN", name: "Tunisie", dial: "216", dropZero: false },
  { iso: "FR", name: "France", dial: "33", dropZero: true },
  { iso: "BE", name: "Belgique", dial: "32", dropZero: true },
  { iso: "CH", name: "Suisse", dial: "41", dropZero: true },
  { iso: "CA", name: "Canada", dial: "1", dropZero: false },
  { iso: "US", name: "États-Unis", dial: "1", dropZero: false },
  { iso: "GB", name: "Royaume-Uni", dial: "44", dropZero: true },
  { iso: "DE", name: "Allemagne", dial: "49", dropZero: true },
];

const DEFAULT_DIAL = "225";

/** Indicatif probable d'après le fuseau horaire du navigateur (le pays est ensuite modifiable) */
export function guessDial(timeZone: string | undefined): string {
  const city = (timeZone ?? "").split("/")[1] ?? "";
  const byCity: Record<string, string> = {
    Abidjan: "225",
    Lome: "228",
    Porto: "229",
    Ouagadougou: "226",
    Dakar: "221",
    Bamako: "223",
    Niamey: "227",
    Conakry: "224",
    Accra: "233",
    Lagos: "234",
    Douala: "237",
    Libreville: "241",
    Brazzaville: "242",
    Kinshasa: "243",
    Casablanca: "212",
    Algiers: "213",
    Tunis: "216",
    Paris: "33",
    Brussels: "32",
    Zurich: "41",
    London: "44",
    Berlin: "49",
  };
  return byCity[city] ?? DEFAULT_DIAL;
}

const countryOfDial = (dial: string) => COUNTRIES.find((c) => c.dial === dial);

const onlyDigits = (text: string) => text.replace(/\D/g, "");

/** Un numéro valide en format international compte entre 8 et 15 chiffres (norme E.164) */
const validLength = (digits: string) => digits.length >= 8 && digits.length <= 15;

/** Pays + numéro tel qu'on le tape (« 07 12 34 56 78 ») → « +2250712345678 », ou null si invalide */
export function toE164(national: string, dial: string): string | null {
  const trimmed = national.trim();
  // Déjà en format international : on ne tient pas compte du pays choisi
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) return parsePhone(trimmed, dial);
  let digits = onlyDigits(trimmed);
  if (countryOfDial(dial)?.dropZero) digits = digits.replace(/^0+/, "");
  const full = onlyDigits(dial) + digits;
  return validLength(full) ? `+${full}` : null;
}

/**
 * Numéro tiré d'un carnet d'adresses (formats variés) → format international.
 * `defaultDial` : l'indicatif du pays de la personne, pour les numéros écrits sans indicatif.
 */
export function parsePhone(raw: string, defaultDial: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let digits: string;
  if (text.startsWith("+")) digits = onlyDigits(text);
  else if (text.startsWith("00")) digits = onlyDigits(text).slice(2);
  else {
    let national = onlyDigits(text);
    if (countryOfDial(defaultDial)?.dropZero) national = national.replace(/^0+/, "");
    digits = onlyDigits(defaultDial) + national;
  }
  return validLength(digits) ? `+${digits}` : null;
}

/** L'indicatif d'un numéro international (le plus long qui correspond) */
export function dialOf(e164: string): string | null {
  const digits = onlyDigits(e164);
  const match = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial));
  return match?.dial ?? null;
}

/** Quelque chose qui ressemble à un numéro international (pour la connexion : « +225… » ou « 00225… ») */
export function looksLikePhone(identifier: string): boolean {
  const text = identifier.trim();
  return /^(\+|00)[\d\s().-]{7,}$/.test(text);
}

/** « +2250712345678 » → « +225 07 12 34 56 78 » (regroupement simple, pour l'affichage) */
export function formatPhone(e164: string): string {
  const dial = dialOf(e164);
  if (!dial) return e164;
  const rest = onlyDigits(e164).slice(dial.length);
  return `+${dial} ${rest.replace(/(\d{2})(?=\d)/g, "$1 ").trim()}`;
}

/** Préfixe commun de toutes les empreintes : change si un jour le format change */
export const PHONE_HASH_PREFIX = "rodchat-phone:";
