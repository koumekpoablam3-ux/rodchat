import { cookies, headers } from "next/headers";
import { AUTH_COOKIE, signToken, verifyTokenFull } from "./auth";
import { background } from "./background";
import { prisma } from "./prisma";
import { serializeUser, userSelect } from "./users";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function cookieOptions() {
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: THIRTY_DAYS,
  };
}

// État de session de chaque compte, gardé 10 s en mémoire pour ne pas interroger la base à chaque requête.
// Changer le mot de passe, « déconnecter les autres appareils » ou suspendre un compte change cet état :
// les anciens jetons cessent alors de valoir.
const stateCache = new Map<string, { version: number; suspended: boolean; at: number }>();
const STATE_TTL_MS = 10_000;

async function sessionState(userId: string): Promise<{ version: number; suspended: boolean }> {
  const hit = stateCache.get(userId);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit;
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true, suspendedAt: true } });
  const state = { version: row?.sessionVersion ?? -1, suspended: Boolean(row?.suspendedAt), at: Date.now() }; // -1 : compte supprimé
  if (stateCache.size > 2000) stateCache.clear();
  stateCache.set(userId, state);
  return state;
}

export function forgetSessionVersion(userId: string) {
  stateCache.delete(userId);
}

/** « Chrome sur Windows », « Safari sur iOS »… d'après l'identifiant du navigateur */
export function deviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /SamsungBrowser/.test(userAgent)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(userAgent)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(userAgent)
            ? "Chrome"
            : /Safari\//.test(userAgent)
              ? "Safari"
              : "Navigateur";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/.test(userAgent)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux|CrOS/.test(userAgent)
            ? "Linux"
            : "appareil inconnu";
  return `${browser} sur ${system}`;
}

/**
 * Ouvre une session pour cet appareil (une ligne dans la liste « Appareils connectés ») et pose le cookie.
 * Renvoie l'identifiant de la session.
 */
export async function startSession(userId: string): Promise<string> {
  forgetSessionVersion(userId);
  const { version } = await sessionState(userId);
  const safeVersion = Math.max(0, version);
  const session = await prisma.session.create({
    data: { userId, version: safeVersion, label: deviceLabel(headers().get("user-agent") ?? "") },
    select: { id: true },
  });
  cookies().set(AUTH_COOKIE, await signToken(userId, safeVersion, session.id), cookieOptions());
  return session.id;
}

export function endSession() {
  cookies().delete(AUTH_COOKIE);
}

// Une session est-elle toujours valable ? Gardé 10 s en mémoire, comme l'état du compte.
const aliveCache = new Map<string, { alive: boolean; at: number }>();
const lastTouch = new Map<string, number>();
const TOUCH_EVERY_MS = 5 * 60_000;

async function sessionIsAlive(sessionId: string, userId: string, version: number): Promise<boolean> {
  const hit = aliveCache.get(sessionId);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit.alive;
  const row = await prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true, version: true } });
  const alive = Boolean(row && row.userId === userId && row.version === version);
  if (aliveCache.size > 5000) aliveCache.clear();
  aliveCache.set(sessionId, { alive, at: Date.now() });
  return alive;
}

/** Retire immédiatement une session (déconnexion d'un appareil) */
export async function revokeSession(sessionId: string, userId: string) {
  const removed = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  aliveCache.delete(sessionId);
  return removed.count > 0;
}

/** Personne connectée et session en cours (absente pour les anciennes connexions, d'avant la liste des appareils) */
export async function getSessionInfo(): Promise<{ userId: string; sessionId?: string } | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  const verified = token ? await verifyTokenFull(token) : null;
  if (!verified) return null;
  // Jeton révoqué (mot de passe changé, appareils déconnectés), compte supprimé ou suspendu
  const state = await sessionState(verified.userId);
  if (state.suspended || state.version !== verified.sessionVersion) return null;

  if (verified.sessionId) {
    if (!(await sessionIsAlive(verified.sessionId, verified.userId, verified.sessionVersion))) return null;
    // « Dernière activité » : une écriture toutes les 5 minutes au plus, sans retarder la réponse
    const last = lastTouch.get(verified.sessionId) ?? 0;
    if (Date.now() - last > TOUCH_EVERY_MS) {
      if (lastTouch.size > 5000) lastTouch.clear();
      lastTouch.set(verified.sessionId, Date.now());
      background(
        prisma.session
          .update({ where: { id: verified.sessionId }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined),
      );
    }
  }
  return { userId: verified.userId, sessionId: verified.sessionId };
}

export async function getSessionUserId() {
  return (await getSessionInfo())?.userId ?? null;
}

/** Utilisateur connecté, relu en base (null si le compte n'existe plus) */
export async function getSessionUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  return user ? serializeUser(user) : null;
}
