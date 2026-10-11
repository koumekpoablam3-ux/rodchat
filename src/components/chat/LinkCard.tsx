import { ExternalLink } from "lucide-react";
import type { LinkPreview } from "@/types/chat";

/** Aperçu d'un lien sous le message. L'image passe par notre serveur : le site visité ne voit jamais le lecteur. */
export default function LinkCard({ preview, mine }: { preview: LinkPreview; mine: boolean }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`mb-1 block overflow-hidden rounded-xl text-left no-underline ${
        mine ? "bg-white/12" : "bg-black/5 dark:bg-white/8"
      }`}
    >
      {preview.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/link-preview/image?u=${encodeURIComponent(preview.imageUrl)}`}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-40 w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="block px-3 py-2">
        <span className="flex items-center gap-1 text-xs opacity-75">
          <ExternalLink size={12} aria-hidden="true" />
          <span className="truncate">{preview.siteName}</span>
        </span>
        <span className="mt-0.5 block line-clamp-2 text-sm font-semibold leading-snug">{preview.title}</span>
        {preview.description ? (
          <span className="mt-0.5 block line-clamp-2 text-[13px] leading-snug opacity-80">{preview.description}</span>
        ) : null}
      </span>
    </a>
  );
}
