"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { StatusFeed } from "@/types/status";

/** Liste des statuts, rechargée quand un contact publie ou supprime un statut, et à chaque reconnexion */
export function useStatusFeed() {
  const [feed, setFeed] = useState<StatusFeed | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/statuses", { cache: "no-store" });
      if (response.ok) setFeed((await response.json()) as StatusFeed);
    } catch {
      /* hors ligne : on garde la liste actuelle */
    }
  }, []);

  useEffect(() => {
    void reload();
    const socket = getSocket();
    const onChange = () => void reload();
    socket.on("status:updated", onChange);
    socket.on("connect", onChange);
    return () => {
      socket.off("status:updated", onChange);
      socket.off("connect", onChange);
    };
  }, [reload]);

  /** Marque un statut comme vu sans attendre le serveur (la pastille disparaît tout de suite) */
  const markViewed = useCallback((statusId: string) => {
    setFeed((prev) =>
      prev
        ? {
            ...prev,
            groups: prev.groups.map((group) => {
              const items = group.items.map((item) => (item.id === statusId ? { ...item, viewed: true } : item));
              return { ...group, items, unseen: items.filter((item) => !item.viewed).length };
            }),
          }
        : prev,
    );
  }, []);

  return { feed, reload, markViewed };
}
