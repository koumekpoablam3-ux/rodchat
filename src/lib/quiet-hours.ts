// Heures calmes : pas de notification pendant une plage de la journée (par exemple de 22 h à 7 h).
// L'heure se lit dans le fuseau horaire de la personne (nom IANA, ex. « Africa/Abidjan »), donc le changement
// d'heure d'été est géré tout seul. La plage peut passer minuit.

export type QuietSettings = { quietEnabled: boolean; quietStart: number; quietEnd: number; timeZone: string };

export const DEFAULT_QUIET_START = 22 * 60; // 22 h
export const DEFAULT_QUIET_END = 7 * 60; // 7 h

/** « Africa/Abidjan » et consorts : les valeurs que le navigateur sait lire */
export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Minutes écoulées depuis minuit, à l'heure locale du fuseau donné */
export function localMinutes(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (Number.isFinite(hour) && Number.isFinite(minute)) return (hour % 24) * 60 + minute;
  } catch {
    /* fuseau inconnu : on retombe sur l'heure UTC */
  }
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/** Est-on dans les heures calmes de cette personne ? */
export function inQuietHours(settings: QuietSettings, now = new Date()) {
  const { quietEnabled, quietStart, quietEnd, timeZone } = settings;
  if (!quietEnabled || quietStart === quietEnd) return false;
  const minutes = localMinutes(now, timeZone);
  return quietStart < quietEnd ? minutes >= quietStart && minutes < quietEnd : minutes >= quietStart || minutes < quietEnd;
}

/** 1320 → « 22:00 » (champ de saisie d'heure) */
export function minutesToTime(total: number) {
  const clamped = Math.min(1439, Math.max(0, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** « 22:00 » → 1320, ou null si la valeur n'est pas une heure */
export function timeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}
