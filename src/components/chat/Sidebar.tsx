"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, ArrowLeft, BellOff, Pin, Search, SquarePen } from "lucide-react";
import { useLongPress } from "@/hooks/useLongPress";
import { useMessageSearch } from "@/hooks/useMessageSearch";
import { isMuted } from "@/lib/conversation-sort";
import { formatDuration, formatListDate } from "@/lib/format";
import type { ConversationSummary } from "@/types/chat";
import AppMenu from "./AppMenu";
import Avatar from "./Avatar";
import CallsPane from "./CallsPane";
import { useChat } from "./ChatProvider";
import ConversationRowMenu from "./ConversationRowMenu";
import MuteDialog from "./MuteDialog";
import NavRail, { type SidebarTab } from "./NavRail";
import SearchHitRow from "./SearchHitRow";

type LastMessage = NonNullable<ConversationSummary["lastMessage"]>;

function previewBody(last: LastMessage) {
  if (last.deleted) return "Message supprimé";
  switch (last.type) {
    case "TEXT":
    case "SYSTEM":
      return last.content ?? "";
    case "IMAGE":
      return "Photo";
    case "AUDIO":
      return last.attachment?.durationMs ? `Message vocal (${formatDuration(last.attachment.durationMs)})` : "Message vocal";
    case "VIDEO":
      return "Vidéo";
    case "FILE":
      return last.attachment?.fileName ?? "Document";
    case "CALL": {
      const kind = last.call?.kind === "VIDEO" ? "vidéo" : "audio";
      const group = last.call?.calleeId === null ? " de groupe" : "";
      return last.call?.status === "MISSED" ? `Appel ${kind}${group} manqué` : `Appel ${kind}${group}`;
    }
    default:
      return "";
  }
}

function preview(conversation: ConversationSummary, meId: string) {
  const last = conversation.lastMessage;
  if (!last) return "Nouvelle discussion";

  const body = previewBody(last);
  if (last.type === "CALL" || last.type === "SYSTEM") return body;
  if (last.senderId === meId) return `Toi : ${body}`;
  if (conversation.isGroup) {
    const sender = conversation.participants.find((p) => p.id === last.senderId);
    const firstName = sender?.displayName.split(" ")[0];
    return firstName ? `${firstName} : ${body}` : body;
  }
  return body;
}

type RowProps = {
  conversation: ConversationSummary;
  active: boolean;
  typing: boolean;
  online: boolean;
  meId: string;
  onOpenMenu: () => void;
};

function ConversationRow({ conversation, active, typing, online, meId, onOpenMenu }: RowProps) {
  const press = useLongPress(onOpenMenu);
  const unread = conversation.unreadCount;
  const muted = isMuted(conversation.mutedUntil);
  const pinned = conversation.pinnedAt !== null;

  return (
    <li {...press}>
      <Link
        href={`/chat/${conversation.id}`}
        aria-current={active ? "page" : undefined}
        className={`flex select-none items-center gap-3 px-4 py-3 ${
          active ? "bg-bg shadow-[inset_3px_0_0_rgb(var(--accent))]" : "hover:bg-bg/60 focus-visible:bg-bg/60"
        }`}
      >
        <Avatar
          id={conversation.otherUserId ?? conversation.id}
          name={conversation.name}
          avatarUrl={conversation.avatarUrl}
          isGroup={conversation.isGroup}
          online={online}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display font-semibold">{conversation.name}</span>
            <time
              dateTime={conversation.lastMessageAt}
              suppressHydrationWarning
              className={`shrink-0 text-xs ${unread > 0 && !muted ? "font-semibold text-ink" : "text-muted"}`}
            >
              {conversation.lastMessage ? formatListDate(conversation.lastMessageAt) : ""}
            </time>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p
              className={`truncate text-sm ${
                typing ? "font-medium text-brand" : unread > 0 && !muted ? "text-ink" : "text-muted"
              }`}
            >
              {typing ? "écrit…" : preview(conversation, meId)}
            </p>
            <span className="flex shrink-0 items-center gap-1.5 text-muted">
              {muted ? <BellOff size={14} aria-label="En sourdine" /> : null}
              {pinned ? <Pin size={14} aria-label="Épinglée" /> : null}
              {unread > 0 ? (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5 ${
                    muted ? "bg-muted text-bg" : "bg-accent text-accent-ink"
                  }`}
                  aria-label={`${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function Sidebar({ visibleOnMobile }: { visibleOnMobile: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, conversations, onlineIds, typingByConv, setNewChatOpen, updateConversationSettings } = useChat();
  const [tab, setTab] = useState<SidebarTab>("chats");
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [muteId, setMuteId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const q = filter.trim();
  const { hits, loading: searchingMessages, error: searchError } = useMessageSearch(filter);

  const archived = useMemo(() => conversations.filter((c) => c.archivedAt !== null), [conversations]);
  const archivedUnread = archived.reduce((sum, c) => sum + c.unreadCount, 0);

  const visible = useMemo(() => {
    if (q) return conversations.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
    return conversations.filter((c) => (showArchived ? c.archivedAt !== null : c.archivedAt === null));
  }, [conversations, q, showArchived]);

  const menuConversation = menuId ? (conversations.find((c) => c.id === menuId) ?? null) : null;
  const muteConversation = muteId ? (conversations.find((c) => c.id === muteId) ?? null) : null;

  async function change(conversationId: string, patch: Parameters<typeof updateConversationSettings>[1]) {
    setMenuId(null);
    setNotice("");
    const problem = await updateConversationSettings(conversationId, patch);
    if (problem) setNotice(problem);
  }

  return (
    <aside
      className={`${visibleOnMobile ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-line bg-panel md:flex md:w-[26.5rem] md:flex-row lg:w-[28.5rem]`}
    >
      <NavRail tab={tab} onTab={setTab} />
      <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <h1 className="font-display text-[1.75rem] font-extrabold leading-none tracking-tight text-brand">
          {tab === "calls" ? "Appels" : "rodchat"}
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Nouvelle discussion"
            onClick={() => setNewChatOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-bg"
          >
            <SquarePen size={20} />
          </button>
          <AppMenu />
        </div>
      </header>

      {tab === "calls" ? (
        <CallsPane />
      ) : (
        <>
      <div className="px-4 pb-3">
        <label className="relative block">
          <span className="sr-only">Rechercher une discussion ou un message</span>
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Rechercher"
            className="h-11 w-full rounded-xl border border-line bg-bg pl-10 pr-3 text-sm placeholder:text-muted"
          />
        </label>
      </div>

      {notice ? (
        <p role="alert" className="mx-4 mb-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {notice}
        </p>
      ) : null}

      <nav aria-label="Discussions" className="scroll-thin flex-1 overflow-y-auto">
        {/* Accès aux archives, ou retour à la liste principale */}
        {!q && !showArchived && archived.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-bg/60 focus-visible:bg-bg/60"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center text-muted">
              <Archive size={22} aria-hidden="true" />
            </span>
            <span className="flex-1 font-display font-semibold">Archivées</span>
            <span className="text-sm text-muted">{archived.length}</span>
            {archivedUnread > 0 ? (
              <span
                className="min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-bold leading-5 text-accent-ink"
                aria-label={`${archivedUnread} message${archivedUnread > 1 ? "s" : ""} non lu${archivedUnread > 1 ? "s" : ""}`}
              >
                {archivedUnread > 99 ? "99+" : archivedUnread}
              </span>
            ) : null}
          </button>
        ) : null}
        {!q && showArchived ? (
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-bg/60 focus-visible:bg-bg/60"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center text-muted">
              <ArrowLeft size={22} aria-hidden="true" />
            </span>
            <span className="font-display font-semibold">Discussions archivées</span>
          </button>
        ) : null}

        {conversations.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-display text-lg font-semibold">Aucune discussion pour l&apos;instant</p>
            <p className="mt-1 text-sm text-muted">Les personnes déjà inscrites sont à un clic : choisis-en une pour lui écrire.</p>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="mt-4 h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-ink"
            >
              Nouvelle discussion
            </button>
          </div>
        ) : visible.length === 0 && !q ? (
          <p className="px-6 py-10 text-center text-sm text-muted">
            {showArchived ? "Aucune discussion archivée." : "Toutes tes discussions sont archivées."}
          </p>
        ) : (
          <ul>
            {visible.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={pathname === `/chat/${conversation.id}`}
                typing={(typingByConv[conversation.id] ?? []).length > 0}
                online={
                  !conversation.isGroup &&
                  conversation.otherUserId !== null &&
                  onlineIds.has(conversation.otherUserId)
                }
                meId={me.id}
                onOpenMenu={() => setMenuId(conversation.id)}
              />
            ))}
          </ul>
        )}

        {/* Messages qui contiennent la recherche */}
        {q.length >= 2 ? (
          <section aria-label="Messages trouvés" className="border-t border-line">
            <h2 className="px-4 pb-1 pt-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
              Messages
            </h2>
            {searchError ? (
              <p role="alert" className="px-4 py-4 text-sm text-danger">
                {searchError}
              </p>
            ) : searchingMessages && hits.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Recherche en cours…</p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Aucun message ne contient « {q} ».</p>
            ) : (
              <ul>
                {hits.map((hit) => (
                  <SearchHitRow
                    key={hit.id}
                    hit={hit}
                    query={q}
                    meId={me.id}
                    showConversation
                    onSelect={() => router.push(`/chat/${hit.conversationId}?m=${hit.id}`)}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : q && visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted">Aucune discussion ne correspond à « {q} ».</p>
        ) : null}
      </nav>
        </>
      )}

      {menuConversation ? (
        <ConversationRowMenu
          conversation={menuConversation}
          onClose={() => setMenuId(null)}
          onTogglePin={() => void change(menuConversation.id, { pinned: menuConversation.pinnedAt === null })}
          onToggleArchive={() => void change(menuConversation.id, { archived: menuConversation.archivedAt === null })}
          onToggleMute={() => {
            if (isMuted(menuConversation.mutedUntil)) void change(menuConversation.id, { mutedUntil: null });
            else {
              setMenuId(null);
              setMuteId(menuConversation.id);
            }
          }}
        />
      ) : null}

      {muteConversation ? (
        <MuteDialog
          conversationName={muteConversation.name}
          onClose={() => setMuteId(null)}
          onConfirm={(mutedUntil) => {
            setMuteId(null);
            void change(muteConversation.id, { mutedUntil });
          }}
        />
      ) : null}
      </div>
    </aside>
  );
}
