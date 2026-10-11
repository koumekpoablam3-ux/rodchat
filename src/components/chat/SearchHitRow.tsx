import { formatListDate } from "@/lib/format";
import { describeMessage, snippetAround } from "@/lib/message-text";
import type { SearchHit } from "@/types/chat";
import Avatar from "./Avatar";

type SearchHitRowProps = {
  hit: SearchHit;
  query: string;
  meId: string;
  /** Affiche la discussion (recherche globale) plutôt que l'expéditeur seul */
  showConversation: boolean;
  onSelect: () => void;
};

/** Un message trouvé par la recherche, avec le mot cherché en gras */
export default function SearchHitRow({ hit, query, meId, showConversation, onSelect }: SearchHitRowProps) {
  const text = describeMessage(hit.type, hit.content, hit.fileName);
  const { before, match, after } = snippetAround(text, query.trim());
  const sender = hit.senderId === meId ? "Toi" : hit.senderName.split(" ")[0];

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg focus-visible:bg-bg"
      >
        {showConversation ? (
          <Avatar
            id={hit.otherUserId ?? hit.conversationId}
            name={hit.conversationName}
            avatarUrl={hit.conversationAvatarUrl}
            isGroup={hit.isGroup}
            size={44}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display font-semibold">
              {showConversation ? hit.conversationName : sender}
            </span>
            <time dateTime={hit.createdAt} suppressHydrationWarning className="shrink-0 text-xs text-muted">
              {formatListDate(hit.createdAt)}
            </time>
          </div>
          <p className="truncate text-sm text-muted">
            {showConversation ? `${sender} : ` : ""}
            {before}
            {match ? <mark className="rounded bg-accent/40 px-0.5 font-semibold text-ink">{match}</mark> : null}
            {after}
          </p>
        </div>
      </button>
    </li>
  );
}
