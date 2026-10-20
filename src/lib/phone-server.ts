import { createHash } from "crypto";
import { PHONE_HASH_PREFIX } from "./phone";

/** Empreinte SHA-256 d'un numéro international. Identique à celle calculée par le navigateur. */
export const hashPhone = (e164: string) => createHash("sha256").update(PHONE_HASH_PREFIX + e164).digest("hex");

/** Empreinte d'un code SMS (6 chiffres) : le code lui-même n'est jamais enregistré */
export const hashCode = (code: string, phone: string) =>
  createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? ""}:${phone}:${code}`)
    .digest("hex");
