import type { MessageType } from "@/types/chat";

/** Texte court qui décrit un message : le contenu, ou « Photo », « Message vocal »… pour les fichiers */
export function describeMessage(type: MessageType, content: string | null, fileName?: string | null) {
  switch (type) {
    case "TEXT":
    case "SYSTEM":
      return content ?? "";
    case "IMAGE":
      return content ? `📷 ${content}` : "Photo";
    case "AUDIO":
      return "Message vocal";
    case "VIDEO":
      return content ? `🎥 ${content}` : "Vidéo";
    case "FILE":
      return fileName ?? "Document";
    case "POLL":
      return `Sondage : ${content ?? ""}`;
    case "CALL":
      return "Appel";
    default:
      return "";
  }
}

/** Extrait de texte centré sur la première occurrence de la recherche */
export function snippetAround(text: string, query: string, radius = 40) {
  if (!query) return { before: text.slice(0, radius * 2) + (text.length > radius * 2 ? "…" : ""), match: "", after: "" };
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return { before: text.slice(0, radius * 2), match: "", after: "" };
  const start = Math.max(0, index - radius);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, index),
    match: text.slice(index, index + query.length),
    after: text.slice(index + query.length, index + query.length + radius) + (index + query.length + radius < text.length ? "…" : ""),
  };
}
