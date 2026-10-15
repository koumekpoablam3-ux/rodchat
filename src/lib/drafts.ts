"use client";

import { useMemo, useSyncExternalStore } from "react";

// Brouillons : le message commencé dans une discussion est gardé sur l'appareil quand on la quitte,
// et réapparaît à la réouverture. Rien n'est envoyé au serveur.

const KEY = "rodchat-drafts";
const EVENT = "rodchat:drafts";
const MAX_LENGTH = 4000;

type Drafts = Record<string, { text: string; at: number }>;

function readAll(): Drafts {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Drafts;
  } catch {
    return {};
  }
}

export function getDraft(conversationId: string): string {
  return readAll()[conversationId]?.text ?? "";
}

/** Un texte vide supprime le brouillon */
export function saveDraft(conversationId: string, text: string) {
  try {
    const drafts = readAll();
    if (text.trim().length === 0) {
      if (!(conversationId in drafts)) return;
      delete drafts[conversationId];
    } else {
      if (drafts[conversationId]?.text === text) return;
      drafts[conversationId] = { text: text.slice(0, MAX_LENGTH), at: Date.now() };
    }
    localStorage.setItem(KEY, JSON.stringify(drafts));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* stockage indisponible : le brouillon ne survivra pas au changement de discussion */
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Tous les brouillons (identifiant de discussion → texte), à jour en direct */
export function useDrafts(): Record<string, string> {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(KEY) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  return useMemo(() => {
    try {
      const drafts = JSON.parse(raw || "{}") as Drafts;
      return Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, draft.text]));
    } catch {
      return {};
    }
  }, [raw]);
}
