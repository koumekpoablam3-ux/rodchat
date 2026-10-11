import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "rodchat_token";

// Lu à l'appel (et non à l'import) pour que le .env soit déjà chargé
function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquant dans le fichier .env");
  return new TextEncoder().encode(secret);
}

export async function signToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
