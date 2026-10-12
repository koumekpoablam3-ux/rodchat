import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

// Récupération d'une page ou d'une image à l'adresse donnée par un utilisateur (aperçus de liens).
// Le danger : pousser le serveur à contacter son propre réseau (base de données, services internes,
// métadonnées du cloud). On refuse donc tout ce qui n'est pas une adresse publique, à chaque étape.

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;
const USER_AGENT = "RodchatBot/1.0 (aperçu de lien)";

/** Adresse locale, privée ou réservée : on ne s'y connecte jamais */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // lien local, dont les métadonnées cloud
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast et réservé
    );
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    // IPv4 écrit en IPv6 (::ffff:10.0.0.1) : on juge l'IPv4 ; toute autre forme est refusée par prudence
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (lower.startsWith("::ffff:") || lower.startsWith("64:ff9b:")) return true;
    return (
      lower.startsWith("fc") || // unique local
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) || // lien local
      lower.startsWith("ff") // multicast
    );
  }
  return true;
}

/** Seules les pages web ordinaires sont permises : http(s), ports 80/443, pas d'identifiants dans l'adresse */
export function isAllowedUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) !== 0) return !isPrivateAddress(host);
  return host.includes(".") || host.includes(":");
}

// `address` est volontairement large : Node attend une chaîne, ou une liste quand `options.all` est vrai
type LookupCallback = (error: NodeJS.ErrnoException | null, address: any, family?: number) => void;

/**
 * Résolution du nom au moment de la connexion : l'adresse vérifiée est exactement celle utilisée,
 * ce qui empêche qu'un nom change de cible entre la vérification et la connexion.
 */
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new Error("adresse non autorisée"), "", 4);
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

export type SafeResponse = {
  status: number;
  contentType: string;
  body: Buffer;
  finalUrl: URL;
};

type FetchOptions = {
  maxBytes: number;
  accept: string;
  /** Types de contenu acceptés */
  types: RegExp;
  /** Au-delà de maxBytes : garder le début (pages HTML) ou tout refuser (images) */
  allowTruncate: boolean;
};

type Hop = SafeResponse & { location?: string };

function requestOnce(url: URL, options: FetchOptions): Promise<Hop | null> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value: Hop | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };

    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        agent: false,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept,
          "Accept-Language": "fr,en;q=0.8",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");

        if (status >= 300 && status < 400) {
          response.resume();
          const location = response.headers.location;
          return finish(location ? { status, contentType, body: Buffer.alloc(0), finalUrl: url, location } : null);
        }

        const encoding = String(response.headers["content-encoding"] ?? "identity").toLowerCase();
        if (status !== 200 || !options.types.test(contentType) || encoding !== "identity") {
          response.destroy();
          return finish(null);
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > options.maxBytes) {
            response.destroy();
            return finish(
              options.allowTruncate ? { status, contentType, body: Buffer.concat(chunks), finalUrl: url } : null,
            );
          }
          chunks.push(chunk);
        });
        response.on("end", () => finish({ status, contentType, body: Buffer.concat(chunks), finalUrl: url }));
        response.on("error", () => finish(null));
      },
    );

    const timer = setTimeout(() => {
      request.destroy();
      finish(null);
    }, TIMEOUT_MS);
    request.on("error", () => finish(null));
    request.end();
  });
}

/** Télécharge une adresse publique, en suivant quelques redirections (chacune revérifiée). Null au moindre doute. */
export async function safeFetch(rawUrl: string, options: FetchOptions): Promise<SafeResponse | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedUrl(url)) return null;
    const result = await requestOnce(url, options);
    if (!result) return null;
    if (result.location) {
      try {
        url = new URL(result.location, url);
      } catch {
        return null;
      }
      continue;
    }
    return result;
  }
  return null;
}
