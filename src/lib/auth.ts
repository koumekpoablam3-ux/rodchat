import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "rodchat_token";

// Lu à l'appel (et non à l'import) pour que le .env soit déjà chargé
function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquant dans le fichier .env");
  return new TextEncoder().encode(secret);
}

export async function signToken(userId: string, sessionVersion = 0, sessionId?: string) {
  return new SignJWT({ sv: sessionVersion, ...(sessionId ? { sid: sessionId } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<string | null> {
  return (await verifyTokenFull(token))?.userId ?? null;
}

/** Jeton valide : la personne et la version de session qu'il porte (0 pour les anciens jetons, sans version) */
export async function verifyTokenFull(
  token: string,
): Promise<{ userId: string; sessionVersion: number; sessionId?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      sessionVersion: typeof payload.sv === "number" ? payload.sv : 0,
      // Absent des anciens jetons (connexions d'avant la liste des appareils)
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
    };
  } catch {
    return null;
  }
}
