"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Clock, LoaderCircle, Phone, Search, Video, WifiOff } from "lucide-react";
import { useCall } from "@/components/call/CallProvider";
import { formatDayLabel, formatLastSeen } from "@/lib/format";
import { DELETE_FOR_ALL_WINDOW_MS, EDIT_WINDOW_MS, disappearingLabel } from "@/lib/limits";
import { messageStatus } from "@/lib/message-status";
import type { ChatMessage } from "@/types/chat";
import Avatar from "./Avatar";
import CallLogRow from "./CallLogRow";
import { useChat } from "./ChatProvider";
import Composer from "./Composer";
import ConversationInfo from "./ConversationInfo";
import ConversationSearch from "./ConversationSearch";
import ForwardDialog from "./ForwardDialog";
import MessageBubble from "./MessageBubble";
import MessageMenu from "./MessageMenu";
import SystemRow from "./SystemRow";

type Item =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: ChatMessage; showSender: boolean; tail: boolean };

const NO_MESSAGES: ChatMessage[] = [];
const DELETABLE_TYPES = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE"];

/** Appels et messages système : lignes d'information, pas des bulles */
const isInfoRow = (message: ChatMessage) => message.type === "CALL" || message.type === "SYSTEM";

type ChatViewProps = {
  conversationId: string;
  /** Message à afficher en premier (arrivée depuis une recherche) */
  focusMessageId?: string;
};

export default function ChatView({ conversationId, focusMessageId }: ChatViewProps) {
  const {
    me,
    connected,
    conversations,
    onlineIds,
    lastSeen,
    typingByConv,
    messagesByConv,
    hasMoreByConv,
    hasNewerByConv,
    loadedByConv,
    setActiveConversation,
    loadLatest,
    loadOlder,
    loadAround,
    retryMessage,
    discardMessage,
    markRead,
    deleteMessage,
    reactToMessage,
    starredIds,
    toggleStar,
  } = useChat();
  const { startCall, startGroupCall, joinGroupCall, ongoingGroupCalls, activeGroupConversationId, inCall } = useCall();

  const conversation = conversations.find((c) => c.id === conversationId);
  const messages = messagesByConv[conversationId] ?? NO_MESSAGES;
  const loaded = loadedByConv[conversationId] === true;
  const hasMore = hasMoreByConv[conversationId] === true;
  const hasNewer = hasNewerByConv[conversationId] === true;
  const unread = conversation?.unreadCount ?? 0;
  const groupCall = ongoingGroupCalls[conversationId];

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [forwardId, setForwardId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);
  const firstIdRef = useRef<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Cette discussion devient la discussion active, et on charge ses messages
  // (ceux d'autour du message demandé si on arrive d'une recherche)
  useEffect(() => {
    setActiveConversation(conversationId);
    let cancelled = false;
    if (focusMessageId) {
      if (messagesRef.current.some((m) => m.id === focusMessageId)) {
        setFocusId(focusMessageId);
      } else {
        void loadAround(conversationId, focusMessageId).then((found) => {
          if (cancelled) return;
          if (found) setFocusId(focusMessageId);
          else {
            setToast("Ce message n'est plus disponible.");
            void loadLatest(conversationId);
          }
        });
      }
    } else {
      void loadLatest(conversationId);
    }
    return () => {
      cancelled = true;
      setActiveConversation(null);
    };
  }, [conversationId, focusMessageId, setActiveConversation, loadLatest, loadAround]);

  // Messages lus dès qu'ils sont à l'écran
  useEffect(() => {
    if (unread > 0 && document.visibilityState === "visible") markRead(conversationId);
  }, [unread, conversationId, markRead]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") markRead(conversationId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversationId, markRead]);

  // Défilement : en bas pour les nouveaux messages, position conservée quand on remonte l'historique
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstId = messages[0]?.id ?? null;
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    const appended = lastId !== lastIdRef.current;

    if (heightBeforeOlder.current !== null && firstId !== firstIdRef.current) {
      el.scrollTop = el.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (stickToBottom.current || (appended && last?.senderId === me.id)) {
      el.scrollTop = el.scrollHeight;
    }
    firstIdRef.current = firstId;
    lastIdRef.current = lastId;
  }, [messages, me.id]);

  // Saut vers un message (recherche, clic sur une citation) : on le centre, puis on le met en évidence
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`msg-${focusId}`);
    if (!el) return; // pas encore affiché : on réessaie quand la liste change
    stickToBottom.current = false;
    el.scrollIntoView({ block: "center" });
    setHighlightId(focusId);
    setFocusId(null);
  }, [focusId, messages]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const items = useMemo<Item[]>(() => {
    const result: Item[] = [];
    let previous: ChatMessage | null = null;

    messages.forEach((message, index) => {
      const newDay =
        !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
      if (newDay) {
        result.push({
          kind: "day",
          key: `day-${message.createdAt.slice(0, 10)}-${index}`,
          label: formatDayLabel(message.createdAt),
        });
      }

      const next = messages[index + 1];
      const sameSenderAsPrevious =
        !newDay && previous?.senderId === message.senderId && !isInfoRow(previous);
      const nextSameDay =
        !!next && new Date(next.createdAt).toDateString() === new Date(message.createdAt).toDateString();

      result.push({
        kind: "message",
        key: message.clientId ?? message.id,
        message,
        showSender: !sameSenderAsPrevious,
        tail: !(next && nextSameDay && !isInfoRow(next) && next.senderId === message.senderId),
      });
      previous = message;
    });
    return result;
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-display text-xl font-semibold">Cette discussion est introuvable</p>
        <p className="text-muted">Elle a peut-être été supprimée, ou tu n&apos;en fais plus partie.</p>
        <Link href="/chat" className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink">
          Retour aux discussions
        </Link>
      </div>
    );
  }

  const other = conversation.isGroup
    ? null
    : (conversation.participants.find((p) => p.id === conversation.otherUserId) ?? null);
  const nameOf = (userId: string) =>
    conversation.participants.find((p) => p.id === userId)?.displayName ?? "Quelqu'un";
  const online = other ? onlineIds.has(other.id) : false;

  const typers = (typingByConv[conversationId] ?? []).filter((id) => id !== me.id);
  let subtitle = "";
  let subtitleClass = "text-muted";
  if (typers.length > 0) {
    subtitle = !conversation.isGroup
      ? "écrit…"
      : typers.length === 1
        ? `${nameOf(typers[0]).split(" ")[0]} écrit…`
        : "Plusieurs personnes écrivent…";
    subtitleClass = "font-medium text-brand";
  } else if (other) {
    if (online) {
      subtitle = "en ligne";
      subtitleClass = "text-emerald-600 dark:text-emerald-400";
    } else {
      const seen = lastSeen[other.id] ?? other.lastSeenAt;
      subtitle = seen ? formatLastSeen(seen) : "";
    }
  } else {
    subtitle = conversation.participants.map((p) => (p.id === me.id ? "Toi" : p.displayName)).join(", ");
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function showOlder() {
    const el = scrollRef.current;
    if (!el || loadingOlder) return;
    heightBeforeOlder.current = el.scrollHeight;
    setLoadingOlder(true);
    await loadOlder(conversationId);
    setLoadingOlder(false);
  }

  async function backToLatest() {
    stickToBottom.current = true;
    await loadLatest(conversationId);
  }

  /** Aller à un message, en chargeant l'extrait de discussion qui l'entoure s'il n'est pas affiché */
  async function goToMessage(messageId: string) {
    if (!messages.some((m) => m.id === messageId)) {
      const found = await loadAround(conversationId, messageId);
      if (!found) {
        setToast("Ce message n'est plus disponible.");
        return;
      }
    }
    setFocusId(messageId);
  }

  // --- Menu d'un message ---
  const menuMessage = menuId ? (messages.find((m) => m.id === menuId) ?? null) : null;
  const replyTo = replyToId ? (messages.find((m) => m.id === replyToId) ?? null) : null;
  const editing = editingId ? (messages.find((m) => m.id === editingId) ?? null) : null;

  function closeMenu() {
    setMenuId(null);
  }

  async function copyText(message: ChatMessage) {
    closeMenu();
    try {
      await navigator.clipboard.writeText(message.content ?? "");
      setToast("Message copié");
    } catch {
      setToast("Impossible de copier ce message.");
    }
  }

  async function shareText(message: ChatMessage) {
    closeMenu();
    try {
      await navigator.share({ text: message.content ?? "" });
    } catch {
      /* partage annulé : rien à signaler */
    }
  }

  async function star(message: ChatMessage) {
    closeMenu();
    const problem = await toggleStar(message.id);
    if (problem) setToast(problem);
  }

  async function remove(message: ChatMessage, scope: "me" | "all") {
    closeMenu();
    const problem = await deleteMessage(conversationId, message.id, scope);
    if (problem) setToast(problem);
  }

  async function react(messageId: string, emoji: string) {
    const problem = await reactToMessage(conversationId, messageId, emoji);
    if (problem) setToast(problem);
  }

  const now = Date.now();
  const menuIsMine = menuMessage?.senderId === me.id;
  const menuAge = menuMessage ? now - new Date(menuMessage.createdAt).getTime() : 0;

  const headerButton =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-bg disabled:opacity-40 disabled:hover:bg-transparent";
  const callsDisabled = inCall || !connected || (conversation.isGroup && !!groupCall);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:px-4">
        <Link
          href="/chat"
          aria-label="Retour aux discussions"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-bg md:hidden"
        >
          <ArrowLeft size={22} />
        </Link>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label={`Infos de ${conversation.name}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-0.5 text-left"
        >
          <Avatar
            id={conversation.otherUserId ?? conversation.id}
            name={conversation.name}
            avatarUrl={conversation.avatarUrl}
            isGroup={conversation.isGroup}
            size={42}
            online={online}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-display text-base font-semibold leading-tight">{conversation.name}</span>
              {conversation.disappearingSeconds !== null ? (
                <Clock
                  size={14}
                  className="shrink-0 text-muted"
                  aria-label={`Messages éphémères : ${disappearingLabel(conversation.disappearingSeconds)}`}
                />
              ) : null}
            </span>
            <span className={`block truncate text-xs ${subtitleClass}`} suppressHydrationWarning>
              {subtitle || "\u00a0"}
            </span>
          </span>
        </button>

        <div className="flex items-center">
          <button type="button" className={headerButton} aria-label="Rechercher dans la discussion" onClick={() => setSearchOpen(true)}>
            <Search size={20} />
          </button>
          <button
            type="button"
            className={headerButton}
            disabled={callsDisabled}
            aria-label={conversation.isGroup ? `Appel audio de groupe dans ${conversation.name}` : `Appel audio avec ${conversation.name}`}
            onClick={() =>
              void (conversation.isGroup ? startGroupCall(conversationId, "AUDIO") : startCall(conversationId, "AUDIO"))
            }
          >
            <Phone size={20} />
          </button>
          <button
            type="button"
            className={headerButton}
            disabled={callsDisabled}
            aria-label={conversation.isGroup ? `Appel vidéo de groupe dans ${conversation.name}` : `Appel vidéo avec ${conversation.name}`}
            onClick={() =>
              void (conversation.isGroup ? startGroupCall(conversationId, "VIDEO") : startCall(conversationId, "VIDEO"))
            }
          >
            <Video size={21} />
          </button>
        </div>
      </header>

      {!connected ? (
        <div
          role="status"
          className="flex items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
        >
          <WifiOff size={16} aria-hidden="true" />
          Reconnexion en cours. Tes messages partiront dès que la connexion revient.
        </div>
      ) : null}

      {/* Un appel de groupe est en cours dans cette discussion */}
      {conversation.isGroup && groupCall && activeGroupConversationId !== conversationId ? (
        <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
          {groupCall.kind === "VIDEO" ? <Video size={18} aria-hidden="true" className="text-brand" /> : <Phone size={18} aria-hidden="true" className="text-brand" />}
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">Appel {groupCall.kind === "VIDEO" ? "vidéo" : "audio"} de groupe en cours</span>
            <span className="text-muted">
              {" "}
              · {groupCall.participantIds.length} participant{groupCall.participantIds.length > 1 ? "s" : ""}
            </span>
          </p>
          <button
            type="button"
            disabled={inCall || !connected}
            onClick={() => void joinGroupCall(conversationId)}
            className="h-9 shrink-0 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Rejoindre
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="wallpaper scroll-thin flex-1 overflow-y-auto px-3 py-3 md:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          {hasMore ? (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => void showOlder()}
                disabled={loadingOlder}
                className="rounded-full bg-panel px-4 py-2 text-sm font-medium text-ink shadow-sm disabled:opacity-60"
              >
                {loadingOlder ? "Chargement…" : "Voir les messages précédents"}
              </button>
            </div>
          ) : null}

          {!loaded && messages.length === 0 ? (
            <div className="flex justify-center py-10 text-muted" role="status">
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-label="Chargement des messages" />
            </div>
          ) : null}

          {loaded && messages.length === 0 ? (
            <p className="mx-auto my-10 max-w-xs rounded-2xl bg-panel/90 px-5 py-4 text-center text-sm text-muted shadow-sm">
              Aucun message pour l&apos;instant. Écris le premier ci-dessous.
            </p>
          ) : null}

          {items.map((item) => {
            if (item.kind === "day") {
              return (
                <div key={item.key} className="my-3 flex justify-center">
                  <span
                    className="rounded-full bg-panel/95 px-3 py-1 text-xs font-medium text-muted shadow-sm"
                    suppressHydrationWarning
                  >
                    {item.label}
                  </span>
                </div>
              );
            }
            if (item.message.type === "CALL") {
              return <CallLogRow key={item.key} message={item.message} meId={me.id} />;
            }
            if (item.message.type === "SYSTEM") {
              return <SystemRow key={item.key} message={item.message} />;
            }
            const { message } = item;
            const clientId = message.clientId;
            return (
              <MessageBubble
                key={item.key}
                message={message}
                meId={me.id}
                mine={message.senderId === me.id}
                showSender={conversation.isGroup && message.senderId !== me.id && item.showSender}
                senderName={message.sender?.displayName ?? nameOf(message.senderId)}
                tail={item.tail}
                status={messageStatus(message)}
                starred={starredIds.has(message.id)}
                highlighted={highlightId === message.id}
                onRetry={clientId ? () => retryMessage(conversationId, clientId) : undefined}
                onDiscard={clientId ? () => discardMessage(conversationId, clientId) : undefined}
                onOpenMenu={() => setMenuId(message.id)}
                onReplyClick={(id) => void goToMessage(id)}
                onReact={(emoji) => void react(message.id, emoji)}
              />
            );
          })}
        </div>
      </div>

      {/* On regarde un extrait ancien : retour rapide aux derniers messages */}
      {hasNewer ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
          <button
            type="button"
            onClick={() => void backToLatest()}
            className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-brand-ink shadow-lg"
          >
            <ArrowDown size={16} aria-hidden="true" />
            Derniers messages
          </button>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="rise pointer-events-none absolute inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm font-medium text-bg shadow-xl"
        >
          {toast}
        </div>
      ) : null}

      <Composer
        conversationId={conversationId}
        onSent={() => {
          stickToBottom.current = true;
        }}
        replyTo={replyTo}
        onCancelReply={() => setReplyToId(null)}
        editing={editing}
        onCancelEdit={() => setEditingId(null)}
      />

      {menuMessage ? (
        <MessageMenu
          message={menuMessage}
          mine={menuIsMine}
          canEdit={
            menuIsMine && menuMessage.type === "TEXT" && menuMessage.deletedAt === null && menuAge <= EDIT_WINDOW_MS
          }
          canDeleteForAll={
            menuIsMine &&
            menuMessage.deletedAt === null &&
            DELETABLE_TYPES.includes(menuMessage.type) &&
            menuAge <= DELETE_FOR_ALL_WINDOW_MS
          }
          myReaction={menuMessage.reactions.find((r) => r.userId === me.id)?.emoji ?? null}
          starred={starredIds.has(menuMessage.id)}
          canShare={typeof navigator !== "undefined" && typeof navigator.share === "function"}
          onClose={closeMenu}
          onReact={(emoji) => {
            closeMenu();
            void react(menuMessage.id, emoji);
          }}
          onReply={() => {
            closeMenu();
            setEditingId(null);
            setReplyToId(menuMessage.id);
          }}
          onCopy={() => void copyText(menuMessage)}
          onShare={() => void shareText(menuMessage)}
          onToggleStar={() => void star(menuMessage)}
          onForward={() => {
            closeMenu();
            setForwardId(menuMessage.id);
          }}
          onEdit={() => {
            closeMenu();
            setReplyToId(null);
            setEditingId(menuMessage.id);
          }}
          onDelete={(scope) => void remove(menuMessage, scope)}
        />
      ) : null}

      {forwardId ? (
        <ForwardDialog
          messageId={forwardId}
          onClose={() => setForwardId(null)}
          onDone={(count) => {
            setForwardId(null);
            setToast(count > 1 ? `Message transféré à ${count} discussions` : "Message transféré");
          }}
        />
      ) : null}

      {infoOpen ? (
        <ConversationInfo
          conversationId={conversationId}
          onClose={() => setInfoOpen(false)}
          onSearch={() => setSearchOpen(true)}
          onGoToMessage={(messageId) => void goToMessage(messageId)}
        />
      ) : null}

      {searchOpen ? (
        <ConversationSearch
          conversationId={conversationId}
          onClose={() => setSearchOpen(false)}
          onSelect={(messageId) => void goToMessage(messageId)}
        />
      ) : null}
    </div>
  );
}
