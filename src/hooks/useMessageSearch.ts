"use client";

import { useEffect, useState } from "react";
import type { SearchHit } from "@/types/chat";

/** Recherche de messages avec un léger délai (pas une requête par lettre). Toutes les discussions, ou une seule. */
export function useMessageSearch(query: string, conversationId?: string) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (conversationId) params.set("conversationId", conversationId);
        const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
        const data = (await response.json().catch(() => null)) as { hits?: SearchHit[]; error?: string } | null;
        if (!response.ok) {
          setHits([]);
          setError(data?.error ?? "La recherche a échoué. Réessaie.");
        } else {
          setHits(data?.hits ?? []);
          setError("");
        }
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setHits([]);
          setError("Connexion impossible. Vérifie ton réseau et réessaie.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, conversationId]);

  return { hits, loading, error };
}
