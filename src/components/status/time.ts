/** « Aujourd'hui, 14:32 » ou « Hier, 21:05 » (un statut dure 24 h) */
export function statusTime(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? `Aujourd'hui, ${time}` : `Hier, ${time}`;
}
