// Tri de la liste des discussions : les épinglées d'abord (la dernière épinglée en haut),
// puis les plus récemment actives. Partagé entre le serveur et l'interface.
type Sortable = { pinnedAt: string | null; lastMessageAt: string };

export function sortConversations<T extends Sortable>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
    if (a.pinnedAt) return -1;
    if (b.pinnedAt) return 1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

/** Une sourdine est active tant que sa date n'est pas passée */
export function isMuted(mutedUntil: string | null) {
  return mutedUntil !== null && new Date(mutedUntil).getTime() > Date.now();
}
