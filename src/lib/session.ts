import { cookies } from "next/headers";
import { AUTH_COOKIE, signToken, verifyTokenFull } from "./auth";
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

export async function startSession(userId: string) {
  forgetSessionVersion(userId);
  const { version } = await sessionState(userId);
  cookies().set(AUTH_COOKIE, await signToken(userId, Math.max(0, version)), cookieOptions());
}

export function endSession() {
  cookies().delete(AUTH_COOKIE);
}

export async function getSessionUserId() {
  const token = cookies().get(AUTH_COOKIE)?.value;
  const verified = token ? await verifyTokenFull(token) : null;
  if (!verified) return null;
  // Jeton révoqué (mot de passe changé, appareils déconnectés), compte supprimé ou suspendu
  const state = await sessionState(verified.userId);
  return !state.suspended && state.version === verified.sessionVersion ? verified.userId : null;
}

/** Utilisateur connecté, relu en base (null si le compte n'existe plus) */
export async function getSessionUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  return user ? serializeUser(user) : null;
}
