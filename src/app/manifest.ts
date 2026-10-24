import type { MetadataRoute } from "next";

/**
 * Cible de partage (Web Share Target) : une fois l'application installée, « Partager » dans le navigateur ou une autre
 * application propose Rodchat. Le texte et le lien arrivent sur /chat/share, qui laisse choisir la discussion.
 * Le type de Next ne connaît pas encore ce champ : on l'ajoute ici.
 */
type ManifestWithShare = MetadataRoute.Manifest & {
  share_target?: { action: string; method: "GET"; params: { title: string; text: string; url: string } };
};

export default function manifest(): ManifestWithShare {
  return {
    name: "Rodchat",
    short_name: "Rodchat",
    description: "Messagerie instantanée : discussions privées et groupes.",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#2B1D44",
    theme_color: "#2B1D44",
    lang: "fr",
    share_target: { action: "/chat/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
