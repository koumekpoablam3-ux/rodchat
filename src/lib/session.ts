import { cookies } from "next/headers";
import { AUTH_COOKIE, signToken, verifyToken } from "./auth";
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

export async function startSession(userId: string) {
  cookies().set(AUTH_COOKIE, await signToken(userId), cookieOptions());
}

export function endSession() {
  cookies().delete(AUTH_COOKIE);
}

export async function getSessionUserId() {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return token ? verifyToken(token) : null;
}

/** Utilisateur connecté, relu en base (null si le compte n'existe plus) */
export async function getSessionUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  return user ? serializeUser(user) : null;
}
