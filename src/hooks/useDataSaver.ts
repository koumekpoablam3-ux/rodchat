"use client";

import { useCallback, useSyncExternalStore } from "react";

// Mode « économie de données » (faible connexion) : photos à la demande, pas d'aperçus de liens, envois plus légers.
// Trois réglages : automatique (selon la connexion de l'appareil), toujours, jamais. Enregistré sur l'appareil.

export type DataSaverMode = "auto" | "on" | "off";

const KEY = "rodchat-data-saver";
const EVENT = "rodchat:data-saver";

type NetworkInformation = { saveData?: boolean; effectiveType?: string };
const connection = (): NetworkInformation | undefined =>
  typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: NetworkInformation }).connection;

export function readDataSaverMode(): DataSaverMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === "on" || value === "off" ? value : "auto";
  } catch {
    return "auto";
  }
}

/** La connexion de l'appareil est-elle lente, ou l'économie de données demandée au niveau du système ? */
export function connectionIsConstrained(): boolean {
  const info = connection();
  return info?.saveData === true || info?.effectiveType === "slow-2g" || info?.effectiveType === "2g";
}

/** Utilisable hors composant (compression des photos avant l'envoi) */
export function isDataSaverOn(): boolean {
  const mode = readDataSaverMode();
  return mode === "on" || (mode === "auto" && connectionIsConstrained());
}

function subscribe(onChange: () => void) {
  const network = connection() as unknown as EventTarget | undefined;
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  network?.addEventListener?.("change", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    network?.removeEventListener?.("change", onChange);
  };
}

// La valeur lue est une chaîne simple (comparable) : « mode|contraint »
const snapshot = () => `${readDataSaverMode()}|${connectionIsConstrained() ? 1 : 0}`;

export function useDataSaver() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "auto|0");
  const [mode, constrained] = raw.split("|") as [DataSaverMode, string];
  const active = mode === "on" || (mode === "auto" && constrained === "1");

  const setMode = useCallback((next: DataSaverMode) => {
    try {
      if (next === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* stockage indisponible : le réglage vaudra jusqu'au prochain chargement */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { active, mode, constrained: constrained === "1", setMode };
}
