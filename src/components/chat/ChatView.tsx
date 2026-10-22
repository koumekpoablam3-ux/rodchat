"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  AtSign,
  Clock,
  Copy,
  Forward,
  LoaderCircle,
  Phone,
  Pin,
  Search,
  Star,
  Trash2,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { useCall } from "@/components/call/CallProvider";
import { formatDayLabel, formatLastSeen } from "@/lib/format";
import { DELETE_FOR_ALL_WINDOW_MS, EDIT_WINDOW_MS, disappearingLabel } from "@/lib/limits";
import { messageStatus } from "@/lib/message-status";
import BubbleRow, { type BubbleActions } from "./BubbleRow";
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
import MessageInfoDialog from "./MessageInfoDialog";
import BulkDeleteDialog from "./BulkDeleteDialog";
import ReportDialog from "./ReportDialog";
import SystemRow from "./SystemRow";

type Item =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string; count: number }
  | { kind: "message"; key: string; message: ChatMessage; showSender: boolean; tail: boolean };

const NO_MESSAGES: ChatMessage[] = [];
const DELETABLE_TYPES = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE", "POLL"];

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
    updateConversationSettings,
    markRead,
    deleteMessage,
    reactToMessage,
    starredIds,
    toggleStar,
    pinMessage,
    votePoll,
    setBlocked,
  } = useChat();
  const { startCall, startGroupCall, joinGroupCall, ongoingGroupCalls, activeGroupConversationId, inCall } = useCall();

  const conversation = conversations.find((c) => c.id === conversationId);

  // Le bandeau « Reconnexion » n'apparaît que si la coupure dure : pas de clignotement à l'ouverture de la page
  // ni au retour sur l'onglet (le flux temps réel se rouvre en une ou deux secondes)
  const [offlineLong, setOfflineLong] = useState(false);
  useEffect(() => {
    if (connected) {
      setOfflineLong(false);
      return;
    }
    const timer = setTimeout(() => setOfflineLong(true), 3000);
    return () => clearTimeout(timer);
  }, [connected]);

  const [forwardIds, setForwardIds] = useState<string[] | null>(null);
  // Sélection de plusieurs messages (copier, mettre en favori, transférer, supprimer)
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Plus rien de coché : on sort du mode sélection. Changer de discussion ou appuyer sur Échap aussi.
  useEffect(() => {
    if (selecting && selectedIds.size === 0) setSelecting(false);
  }, [selecting, selectedIds]);
  useEffect(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, [conversationId]);
  useEffect(() => {
    if (!selecting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !bulkDeleteOpen && !forwardIds) {
        setSelecting(false);
        setSelectedIds(new Set());
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecting, bulkDeleteOpen, forwardIds]);

  const messages = messagesByConv[conversationId] ?? NO_MESSAGES;
  const loaded = loadedByConv[conversationId] === true;
  const hasMore = hasMoreByConv[conversationId] === true;
  const hasNewer = hasNewerByConv[conversationId] === true;
  const unread = conversation?.unreadCount ?? 0;
  const pinnedMessages = conversation?.pinnedMessages ?? [];
  const groupCall = ongoingGroupCalls[conversationId];

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [pinIndex, setPinIndex] = useState(0);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [infoMessageId, setInfoMessageId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);
  const firstIdRef = useRef<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Nombre de messages non lus au moment de l'ouverture (lu avant que la discussion soit marquée comme lue)
  const openedUnread = useRef<{ id: string; count: number } | null>(null);
  if (openedUnread.current?.id !== conversationId) openedUnread.current = { id: conversationId, count: unread };

  // Premier message non lu : le séparateur « N messages non lus » s'affiche juste avant
  const [unreadAnchor, setUnreadAnchor] = useState<{ conversationId: string; id: string; count: number } | null>(null);
  const [seenMentions, setSeenMentions] = useState<Set<string>>(() => new Set());
  const anchoredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || anchoredFor.current === conversationId) return;
    anchoredFor.current = conversationId;
    const count = openedUnread.current?.id === conversationId ? openedUnread.current.count : 0;
    setSeenMentions(new Set());
    if (count === 0) return setUnreadAnchor(null);

    const incoming = messagesRef.current.filter(
      (m) => m.senderId !== me.id && m.type !== "SYSTEM" && m.type !== "CALL",
    );
    const first = incoming[Math.max(0, incoming.length - count)];
    if (!first) return setUnreadAnchor(null);
    setUnreadAnchor({ conversationId, id: first.id, count });
    // Beaucoup de non lus : on arrive sur le premier ; sinon on reste en bas
    if (count > 8 && !focusMessageId) setFocusId(first.id);
  }, [loaded, conversationId, me.id, focusMessageId]);

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

  // Ouvrir une discussion marquée « non lue » retire la marque (pas quand on la marque pendant qu'elle est ouverte)
  const flaggedRef = useRef(false);
  flaggedRef.current = conversation?.markedUnread ?? false;
  useEffect(() => {
    if (flaggedRef.current && document.visibilityState === "visible") {
      void updateConversationSettings(conversationId, { markedUnread: false });
    }
  }, [conversationId, updateConversationSettings]);

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

      if (unreadAnchor && unreadAnchor.conversationId === conversationId && message.id === unreadAnchor.id) {
        result.push({ kind: "unread", key: "unread-divider", count: unreadAnchor.count });
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
  }, [messages, unreadAnchor, conversationId]);

  // « @pseudo » des membres du groupe : mis en valeur dans les messages. Mémorisé : un nouvel ensemble à chaque rendu
  // forcerait à refaire toutes les bulles.
  const participants = conversation?.participants;
  const isGroupConversation = conversation?.isGroup ?? false;
  const mentionable = useMemo(
    () => (isGroupConversation && participants ? new Set(participants.map((p) => p.username.toLowerCase())) : undefined),
    [isGroupConversation, participants],
  );

  // Actions des bulles : une seule référence stable qui appelle toujours la dernière version des fonctions
  const latestActions = useRef<BubbleActions | null>(null);
  const bubbleActions = useMemo<BubbleActions>(
    () => ({
      retry: (clientId) => latestActions.current?.retry(clientId),
      discard: (clientId) => latestActions.current?.discard(clientId),
      openMenu: (messageId) => latestActions.current?.openMenu(messageId),
      toggleSelect: (messageId) => latestActions.current?.toggleSelect(messageId),
      goTo: (messageId) => latestActions.current?.goTo(messageId),
      vote: (messageId, optionIds) => latestActions.current?.vote(messageId, optionIds) ?? Promise.resolve(null),
      swipeReply: (messageId) => latestActions.current?.swipeReply(messageId),
      react: (messageId, emoji) => latestActions.current?.react(messageId, emoji),
    }),
    [],
  );

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
  const meUsername = me.username.toLowerCase();
  latestActions.current = {
    retry: (clientId) => retryMessage(conversationId, clientId),
    discard: (clientId) => discardMessage(conversationId, clientId),
    openMenu: (messageId) => setMenuId(messageId),
    toggleSelect: toggleSelected,
    goTo: (messageId) => void goToMessage(messageId),
    vote: (messageId, optionIds) => votePoll(messageId, optionIds),
    swipeReply: (messageId) => {
      setEditingId(null);
      setReplyToId(messageId);
    },
    react: (messageId, emoji) => void react(messageId, emoji),
  };

  // Messages qui me citent, à partir du premier non lu : le bouton « @ » y mène un par un
  const anchorIndex =
    unreadAnchor && unreadAnchor.conversationId === conversationId
      ? messages.findIndex((m) => m.id === unreadAnchor.id)
      : -1;
  const mentionTargets =
    anchorIndex >= 0
      ? messages
          .slice(anchorIndex)
          .filter((m) => m.senderId !== me.id && (m.mentionedIds ?? []).includes(me.id) && !seenMentions.has(m.id))
      : [];

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

  // --- Sélection de plusieurs messages ---

  function startSelecting(firstId: string) {
    closeMenu();
    setSelecting(true);
    setSelectedIds(new Set([firstId]));
  }

  function stopSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedMessages = messages.filter((m) => selectedIds.has(m.id));
  const FORWARDABLE = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE"];
  const canDeleteSelectedForAll =
    selectedMessages.length > 0 &&
    selectedMessages.every(
      (m) =>
        m.senderId === me.id &&
        m.deletedAt === null &&
        !m.localStatus &&
        DELETABLE_TYPES.includes(m.type) &&
        Date.now() - new Date(m.createdAt).getTime() <= DELETE_FOR_ALL_WINDOW_MS,
    );

  async function copySelected() {
    const lines = selectedMessages
      .filter((m) => m.type === "TEXT" && m.content && m.deletedAt === null)
      .map((m) => {
        const time = new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        return `[${time}] ${nameOf(m.senderId)} : ${m.content}`;
      });
    if (lines.length === 0) return setToast("Aucun texte à copier dans cette sélection.");
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setToast(lines.length > 1 ? `${lines.length} messages copiés` : "Message copié");
    } catch {
      setToast("Copie impossible sur cet appareil.");
    }
    stopSelecting();
  }

  async function starSelected() {
    const everyStarred = selectedMessages.every((m) => starredIds.has(m.id));
    for (const m of selectedMessages) {
      if (everyStarred === starredIds.has(m.id)) await toggleStar(m.id);
    }
    setToast(everyStarred ? "Retirés des favoris" : "Ajoutés aux favoris");
    stopSelecting();
  }

  function forwardSelected() {
    const ids = selectedMessages
      .filter((m) => FORWARDABLE.includes(m.type) && m.deletedAt === null && !m.localStatus && !m.attachment?.purgedAt)
      .map((m) => m.id);
    if (ids.length === 0) return setToast("Ces messages ne peuvent pas être transférés.");
    setForwardIds(ids);
  }

  async function deleteSelected(scope: "me" | "all") {
    setBulkBusy(true);
    let problem: string | null = null;
    for (const m of selectedMessages) {
      if (m.deletedAt !== null || m.localStatus) continue;
      problem = (await deleteMessage(conversationId, m.id, scope)) ?? problem;
    }
    setBulkBusy(false);
    stopSelecting();
    setToast(problem ?? (selectedMessages.length > 1 ? "Messages supprimés" : "Message supprimé"));
  }

  async function star(message: ChatMessage) {
    closeMenu();
    const problem = await toggleStar(message.id);
    if (problem) setToast(problem);
  }

  async function togglePin(message: ChatMessage) {
    closeMenu();
    const pinned = pinnedMessages.some((p) => p.id === message.id);
    const problem = await pinMessage(message.id, !pinned);
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
      {selecting ? (
        <div className="flex items-center gap-1 border-b border-line bg-panel px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:px-4">
          <button
            type="button"
            aria-label="Annuler la sélection"
            onClick={stopSelecting}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-bg"
          >
            <X size={22} />
          </button>
          <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold" aria-live="polite">
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
          </p>
          <button type="button" aria-label="Copier" title="Copier" onClick={() => void copySelected()} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg">
            <Copy size={20} />
          </button>
          <button type="button" aria-label="Favori" title="Favori" onClick={() => void starSelected()} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg">
            <Star size={20} />
          </button>
          <button type="button" aria-label="Transférer" title="Transférer" onClick={forwardSelected} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg">
            <Forward size={20} />
          </button>
          <button type="button" aria-label="Supprimer" title="Supprimer" onClick={() => setBulkDeleteOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-danger hover:bg-bg">
            <Trash2 size={20} />
          </button>
        </div>
      ) : null}

      <header className={`${selecting ? "hidden" : "flex"} items-center gap-2 border-b border-line bg-panel px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:px-4`}>
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

      {pinnedMessages.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            const target = pinnedMessages[Math.min(pinIndex, pinnedMessages.length - 1)];
            setPinIndex((pinIndex + 1) % pinnedMessages.length);
            void goToMessage(target.id);
          }}
          aria-label={`Message épinglé : ${pinnedMessages[Math.min(pinIndex, pinnedMessages.length - 1)].preview}. Aller au message.`}
          className="flex w-full items-center gap-3 border-b border-line bg-panel px-4 py-2 text-left hover:bg-bg"
        >
          <Pin size={16} aria-hidden="true" className="shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-brand">
              Message épinglé{pinnedMessages.length > 1 ? ` · ${Math.min(pinIndex, pinnedMessages.length - 1) + 1}/${pinnedMessages.length}` : ""}
            </span>
            <span className="block truncate text-sm">
              <span className="font-medium">{pinnedMessages[Math.min(pinIndex, pinnedMessages.length - 1)].senderName.split(" ")[0]} : </span>
              {pinnedMessages[Math.min(pinIndex, pinnedMessages.length - 1)].preview}
            </span>
          </span>
        </button>
      ) : null}

      {offlineLong ? (
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
            if (item.kind === "unread") {
              return (
                <div key={item.key} role="separator" className="my-3 flex justify-center">
                  <span className="rounded-full bg-panel px-4 py-1 text-xs font-semibold text-brand shadow-sm">
                    {item.count} message{item.count > 1 ? "s" : ""} non lu{item.count > 1 ? "s" : ""}
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
            return (
              <BubbleRow
                key={item.key}
                message={message}
                meId={me.id}
                meUsername={meUsername}
                mentionable={mentionable}
                mine={message.senderId === me.id}
                showSender={conversation.isGroup && message.senderId !== me.id && item.showSender}
                senderName={message.sender?.displayName ?? nameOf(message.senderId)}
                tail={item.tail}
                status={messageStatus(message)}
                starred={starredIds.has(message.id)}
                highlighted={highlightId === message.id}
                selecting={selecting}
                selected={selectedIds.has(message.id)}
                canReply={!selecting && !conversation.blockedByMe}
                actions={bubbleActions}
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

      {mentionTargets.length > 0 ? (
        <div className="pointer-events-none absolute bottom-24 right-4 z-20">
          <button
            type="button"
            aria-label={`Aller à la prochaine mention, ${mentionTargets.length} en tout`}
            onClick={() => {
              const target = mentionTargets[0];
              setSeenMentions((previous) => new Set(previous).add(target.id));
              void goToMessage(target.id);
            }}
            className="pointer-events-auto relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-panel text-brand shadow-lg ring-1 ring-line"
          >
            <AtSign size={22} aria-hidden="true" />
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1 text-center text-xs font-bold leading-5 text-accent-ink"
            >
              {mentionTargets.length}
            </span>
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

      {conversation?.isGroup && conversation.adminsOnly && conversation.myRole !== "ADMIN" ? (
        <div className="border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-muted">
          Seuls les admins peuvent envoyer des messages dans ce groupe.
        </div>
      ) : conversation?.blockedByMe && conversation.otherUserId ? (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-muted">Tu as bloqué {conversation.name}.</p>
          <button
            type="button"
            onClick={() => void setBlocked(conversation.otherUserId as string, false)}
            className="h-10 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink"
          >
            Débloquer
          </button>
        </div>
      ) : (
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
      )}

      {infoMessageId ? <MessageInfoDialog messageId={infoMessageId} onClose={() => setInfoMessageId(null)} /> : null}

      {reportMessageId ? (
        <ReportDialog messageId={reportMessageId} name="ce message" onClose={() => setReportMessageId(null)} />
      ) : null}

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
          pinned={pinnedMessages.some((p) => p.id === menuMessage.id)}
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
          onTogglePin={() => void togglePin(menuMessage)}
          onReport={() => {
            closeMenu();
            setReportMessageId(menuMessage.id);
          }}
          onInfo={() => {
            closeMenu();
            setInfoMessageId(menuMessage.id);
          }}
          onSelect={() => startSelecting(menuMessage.id)}
          onForward={() => {
            closeMenu();
            setForwardIds([menuMessage.id]);
          }}
          onEdit={() => {
            closeMenu();
            setReplyToId(null);
            setEditingId(menuMessage.id);
          }}
          onDelete={(scope) => void remove(menuMessage, scope)}
        />
      ) : null}

      {forwardIds ? (
        <ForwardDialog
          messageIds={forwardIds}
          onClose={() => setForwardIds(null)}
          onDone={(count) => {
            const many = forwardIds.length > 1;
            setForwardIds(null);
            stopSelecting();
            setToast(
              many
                ? `${forwardIds.length} messages transférés`
                : count > 1
                  ? `Message transféré à ${count} discussions`
                  : "Message transféré",
            );
          }}
        />
      ) : null}

      {bulkDeleteOpen ? (
        <BulkDeleteDialog
          count={selectedIds.size}
          canDeleteForAll={canDeleteSelectedForAll}
          busy={bulkBusy}
          onForMe={() => void deleteSelected("me")}
          onForAll={() => void deleteSelected("all")}
          onClose={() => setBulkDeleteOpen(false)}
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
