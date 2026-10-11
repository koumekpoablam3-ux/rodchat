import { safeFetch } from "./safe-fetch";
import type { LinkPreview } from "../types/chat";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/i;
const MAX_HTML_BYTES = 512 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;

/** Premier lien d'un texte, sans la ponctuation qui le suit (« voir https://exemple.fr. ») */
export function firstUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  const url = match[0].replace(/[.,;:!?)\]}»”’]+$/, "");
  return url.length > 8 && url.length <= 2000 ? url : null;
}

function decodeEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (let match = pattern.exec(tag); match; match = pattern.exec(tag)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function clean(text: string | undefined, max: number) {
  if (!text) return null;
  const value = decodeEntities(text).replace(/\s+/g, " ").trim();
  return value ? value.slice(0, max) : null;
}

/** Lit les balises OpenGraph (puis Twitter, puis la balise title) d'une page HTML */
export function parseLinkPreview(html: string, pageUrl: string): LinkPreview | null {
  const head = html.slice(0, MAX_HTML_BYTES);
  const metas = (head.match(/<meta\s[^>]*>/gi) ?? []).map(parseAttributes);
  const meta = (...keys: string[]) => {
    for (const key of keys) {
      const found = metas.find((m) => (m.property ?? m.name ?? "").toLowerCase() === key && m.content);
      if (found) return found.content;
    }
    return undefined;
  };

  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clean(meta("og:title", "twitter:title") ?? titleTag, 150);
  if (!title) return null;

  let imageUrl: string | null = null;
  const image = meta("og:image", "og:image:url", "twitter:image");
  if (image) {
    try {
      const resolved = new URL(decodeEntities(image).trim(), pageUrl);
      if ((resolved.protocol === "http:" || resolved.protocol === "https:") && resolved.href.length <= 2000) {
        imageUrl = resolved.href;
      }
    } catch {
      /* image illisible : on garde l'aperçu sans image */
    }
  }

  return {
    url: pageUrl,
    title,
    description: clean(meta("og:description", "twitter:description", "description"), 300),
    siteName: clean(meta("og:site_name"), 60) ?? new URL(pageUrl).hostname.replace(/^www\./, ""),
    imageUrl,
  };
}

const cache = new Map<string, { at: number; value: LinkPreview | null }>();

/** Aperçu d'un lien (titre, description, image), ou null. Gardé 30 minutes pour ne pas rappeler le site. */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const response = await safeFetch(url, {
    maxBytes: MAX_HTML_BYTES,
    accept: "text/html,application/xhtml+xml",
    types: /^(text\/html|application\/xhtml\+xml)/i,
    allowTruncate: true,
  });

  let value: LinkPreview | null = null;
  if (response) {
    try {
      value = parseLinkPreview(response.body.toString("utf8"), response.finalUrl.href);
    } catch {
      value = null;
    }
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, { at: Date.now(), value });
  return value;
}
