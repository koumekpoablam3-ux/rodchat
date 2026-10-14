"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { StatusAuthor, StatusFeed } from "@/types/status";
import { useChat } from "../chat/ChatProvider";
import StatusViewer, { type ViewerGroup } from "./StatusViewer";
import { useStatusFeed } from "./useStatusFeed";

/** « unseen » : il y a un statut que je n'ai pas vu ; « seen » : il en a un, que j'ai déjà vu ; null : aucun statut */
export type StatusRing = "unseen" | "seen" | null;

type StatusContextValue = {
  feed: StatusFeed | null;
  reload: () => Promise<void>;
  markViewed: (statusId: string) => void;
  /** Anneau à afficher autour de la photo de cette personne, où qu'elle apparaisse */
  ringOf: (userId: string) => StatusRing;
  /** Ouvre le lecteur sur les statuts de cette personne (puis enchaîne sur les suivants) */
  openUserStatus: (userId: string) => void;
  openViewer: (groups: ViewerGroup[], index: number) => void;
};

const StatusContext = createContext<StatusContextValue | null>(null);

/** Null hors de la messagerie (pages de connexion, admin) : les avatars s'y affichent sans anneau */
export function useStatuses() {
  return useContext(StatusContext);
}

/**
 * Tient la liste des statuts pour toute la messagerie : le bouton « Statuts », mais aussi l'anneau autour de la
 * photo de quelqu'un qui a publié, dans la liste des discussions, l'en-tête, les groupes, les appels…
 * Le lecteur plein écran vit ici pour pouvoir s'ouvrir depuis n'importe quelle photo.
 */
export default function StatusProvider({ children }: { children: ReactNode }) {
  const { me } = useChat();
  const { feed, reload, markViewed } = useStatusFeed();
  const [viewer, setViewer] = useState<{ groups: ViewerGroup[]; index: number } | null>(null);

  const rings = useMemo(() => {
    const map = new Map<string, StatusRing>();
    if (!feed) return map;
    if (feed.mine.length > 0) map.set(me.id, "seen");
    for (const group of feed.groups) {
      if (group.items.length > 0) map.set(group.user.id, group.unseen > 0 ? "unseen" : "seen");
    }
    return map;
  }, [feed, me.id]);

  const ringOf = useCallback((userId: string) => rings.get(userId) ?? null, [rings]);
  const openViewer = useCallback((groups: ViewerGroup[], index: number) => setViewer({ groups, index }), []);

  const openUserStatus = useCallback(
    (userId: string) => {
      if (!feed) return;
      if (userId === me.id) {
        if (feed.mine.length === 0) return;
        const mineAuthor: StatusAuthor = { id: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl ?? null };
        return setViewer({ groups: [{ user: mineAuthor, items: feed.mine, mine: true }], index: 0 });
      }
      // Même ordre que dans la liste : non vus d'abord
      const ordered = [...feed.groups.filter((g) => g.unseen > 0), ...feed.groups.filter((g) => g.unseen === 0)];
      const groups: ViewerGroup[] = ordered.map((g) => ({ user: g.user, items: g.items, mine: false }));
      const index = groups.findIndex((g) => g.user.id === userId);
      if (index >= 0) setViewer({ groups, index });
    },
    [feed, me.id, me.displayName, me.avatarUrl],
  );

  const value = useMemo<StatusContextValue>(
    () => ({ feed, reload, markViewed, ringOf, openUserStatus, openViewer }),
    [feed, reload, markViewed, ringOf, openUserStatus, openViewer],
  );

  return (
    <StatusContext.Provider value={value}>
      {children}
      {viewer ? (
        <StatusViewer
          groups={viewer.groups}
          startGroup={viewer.index}
          onViewed={markViewed}
          onChanged={() => void reload()}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </StatusContext.Provider>
  );
}
