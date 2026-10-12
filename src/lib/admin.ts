// Administrateurs : les noms d'utilisateur listés dans ADMIN_USERNAMES (séparés par des virgules).
// Ils peuvent consulter les signalements sur /admin/reports.
export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  const list = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(username.toLowerCase());
}
