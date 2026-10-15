"use client";

// Verrouillage de l'application par un code (4 à 6 chiffres), sur cet appareil.
// Le code n'est jamais enregistré en clair : seule une empreinte (PBKDF2) est gardée, avec un sel aléatoire.
// Cela protège contre quelqu'un qui prend ton téléphone déverrouillé ; ce n'est pas un coffre-fort contre une
// personne qui maîtrise les outils du navigateur sur ton appareil.

const KEY = "rodchat-app-lock";
export const LOCK_EVENT = "rodchat:app-lock";
const ITERATIONS = 150_000;

export type LockConfig = {
  salt: string;
  hash: string;
  /** Nombre de chiffres du code (pour valider tout seul à la dernière frappe) */
  length: number;
  /** Verrouiller après ce nombre de secondes hors de l'application (0 = dès qu'on la quitte, -1 = au démarrage seulement) */
  delaySec: number;
};

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin) as BufferSource, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return toBase64(new Uint8Array(bits));
}

export function readLock(): LockConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LockConfig) : null;
  } catch {
    return null;
  }
}

function writeLock(config: LockConfig | null) {
  try {
    if (config) localStorage.setItem(KEY, JSON.stringify(config));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new Event(LOCK_EVENT));
}

export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);

/** Définit (ou remplace) le code */
export async function setPin(pin: string, delaySec: number) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  writeLock({ salt: toBase64(salt), hash: await derive(pin, salt), length: pin.length, delaySec });
}

export async function checkPin(pin: string): Promise<boolean> {
  const config = readLock();
  if (!config) return true;
  return (await derive(pin, fromBase64(config.salt))) === config.hash;
}

export function setLockDelay(delaySec: number) {
  const config = readLock();
  if (config) writeLock({ ...config, delaySec });
}

export function removeLock() {
  writeLock(null);
}
