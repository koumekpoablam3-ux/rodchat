const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const longDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Nombre de jours calendaires entre aujourd'hui et la date donnée */
export function daysAgo(iso: string) {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function formatTime(iso: string) {
  return timeFormatter.format(new Date(iso));
}

/** Date affichée à droite d'une discussion dans la liste */
export function formatListDate(iso: string) {
  const diff = daysAgo(iso);
  if (diff <= 0) return formatTime(iso);
  if (diff === 1) return "Hier";
  if (diff < 7) return capitalize(weekdayFormatter.format(new Date(iso)));
  return shortDateFormatter.format(new Date(iso));
}

/** Séparateur de jour dans une discussion */
export function formatDayLabel(iso: string) {
  const diff = daysAgo(iso);
  if (diff <= 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return capitalize(weekdayFormatter.format(new Date(iso)));
  return longDateFormatter.format(new Date(iso));
}

export function formatLastSeen(iso: string) {
  const diff = daysAgo(iso);
  if (diff <= 0) return `vu à ${formatTime(iso)}`;
  if (diff === 1) return `vu hier à ${formatTime(iso)}`;
  return `vu le ${shortDateFormatter.format(new Date(iso))}`;
}

/** 75000 -> "1:15" */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** 1536000 -> "1,5 Mo" */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}
