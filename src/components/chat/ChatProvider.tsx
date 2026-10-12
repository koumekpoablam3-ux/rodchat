"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sortConversations } from "@/lib/conversation-sort";
import { apiRequest, NETWORK_ERROR } from "@/lib/client-api";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/limits";
import { getSocket } from "@/lib/socket";
import { uid } from "@/lib/utils";
import type {
  AttachmentType,
  ChatMessage,
  ConversationSummary,
  ParticipantRole,
  QuotedMessage,
  Reaction,
  SendMessageAck,
  UserLite,
} from "@/types/chat";

type MessagesState = Record<string, ChatMessage[]>;

export type ConversationSettingsPatch = {
  pinned?: boolean;
  archived?: boolean;
  /** Date de fin de sourdine, ou null pour réactiver le son */
  mutedUntil?: string | null;
};

export type GroupPatch = {
  name?: string;
  description?: string | null;
  disappearingSeconds?: number | null;
};

type ChatContextValue = {
  me: UserLite;
  connected: boolean;
  conversations: ConversationSummary[];
  onlineIds: ReadonlySet<string>;
  /** Dernière connexion apprise en direct (prioritaire sur celle de la liste) */
  lastSeen: Record<string, string>;
  typingByConv: Record<string, string[]>;
  messagesByConv: MessagesState;
  hasMoreByConv: Record<string, boolean>;
  /** Vrai quand on regarde un extrait ancien de la discussion (après une recherche) */
  hasNewerByConv: Record<string, boolean>;
  loadedByConv: Record<string, boolean>;
  setActiveConversation: (id: string | null) => void;
  loadLatest: (conversationId: string) => Promise<void>;
  loadOlder: (conversationId: string) => Promise<void>;
  /** Charge une fenêtre autour d'un message. Renvoie false si le message n'existe plus. */
  loadAround: (conversationId: string, messageId: string) => Promise<boolean>;
  sendMessage: (conversationId: string, text: string, replyTo?: ChatMessage | null) => void;
  retryMessage: (conversationId: string, clientId: string) => void;
  /** Envoie un fichier, une photo, une vidéo ou un vocal. Renvoie un message d'erreur, ou null si l'envoi démarre. */
  sendAttachment: (conversationId: string, input: AttachmentInput) => Promise<string | null>;
  /** Retire de l'écran un message qui n'a pas pu partir */
  discardMessage: (conversationId: string, clientId: string) => void;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
  markRead: (conversationId: string) => void;
  openDirectChat: (userId: string) => Promise<string>;
  createGroup: (name: string, userIds: string[]) => Promise<string>;

  // Actions sur les messages : chacune renvoie un message d'erreur, ou null si tout s'est bien passé
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<string | null>;
  deleteMessage: (conversationId: string, messageId: string, scope: "me" | "all") => Promise<string | null>;
  reactToMessage: (conversationId: string, messageId: string, emoji: string | null) => Promise<string | null>;
  forwardMessage: (messageId: string, conversationIds: string[]) => Promise<string | null>;
  /** Bloque ou débloque une personne (renvoie un message d'erreur, ou null si tout va bien) */
  setBlocked: (userId: string, blocked: boolean) => Promise<string | null>;

  // Réglages personnels et gestion des groupes
  updateConversationSettings: (conversationId: string, patch: ConversationSettingsPatch) => Promise<string | null>;
  updateGroup: (conversationId: string, patch: GroupPatch) => Promise<string | null>;
  addMembers: (conversationId: string, userIds: string[]) => Promise<string | null>;
  setMemberRole: (conversationId: string, userId: string, role: ParticipantRole) => Promise<string | null>;
  /** Retire un membre, ou me fait quitter le groupe si c'est moi */
  removeMember: (conversationId: string, userId: string) => Promise<string | null>;
  /** Null supprime la photo du groupe */
  setGroupAvatar: (conversationId: string, photo: Blob | null) => Promise<string | null>;

  // Mon profil
  updateProfile: (patch: { displayName?: string; about?: string }) => Promise<string | null>;
  /** Null supprime ma photo */
  setMyAvatar: (photo: Blob | null) => Promise<string | null>;

  /** Identifiants de mes messages favoris */
  starredIds: ReadonlySet<string>;
  toggleStar: (messageId: string) => Promise<string | null>;

  newChatOpen: boolean;
  setNewChatOpen: (open: boolean) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat doit être utilisé dans <ChatProvider>.");
  return value;
}

// --- Fonctions pures sur les messages -------------------------------------------------

/** Ajoute ou remplace un message (par id, ou par clientId pour les messages en attente) */
function upsertMessage(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = list.findIndex(
    (m) => m.id === message.id || (message.clientId !== null && m.clientId === message.clientId),
  );
  if (index === -1) return [...list, message];
  const next = list.slice();
  next[index] = message;
  return next;
}

/** Fusionne des messages venus du serveur avec ceux déjà affichés, sans perdre les messages en attente */
function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of existing) if (!m.localStatus) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);

  const confirmed = Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const stillLocal = existing.filter(
    (m) => m.localStatus && !confirmed.some((s) => s.clientId !== null && s.clientId === m.clientId),
  );
  return [...confirmed, ...stillLocal];
}

/**
 * Fusion après le chargement des derniers messages. En plus de mergeMessages, on retire ce qui a
 * disparu pendant qu'on n'écoutait pas (supprimé, expiré, masqué) : un message déjà affiché avant
 * la requête, situé dans la fenêtre reçue mais absent de la réponse.
 */
function mergeLatest(
  existing: ChatMessage[],
  incoming: ChatMessage[],
  hasMore: boolean,
  knownBefore: ReadonlySet<string>,
): ChatMessage[] {
  const incomingIds = new Set(incoming.map((m) => m.id));
  const oldest = incoming[0]?.createdAt;
  const kept = existing.filter((m) => {
    if (m.localStatus || incomingIds.has(m.id) || !knownBefore.has(m.id)) return true;
    // Plus ancien que la fenêtre reçue : on ne peut rien conclure
    if (hasMore && (oldest === undefined || m.createdAt < oldest)) return true;
    return false;
  });
  return mergeMessages(kept, incoming);
}

/** Met à jour l'accusé d'un destinataire sur les messages qui correspondent */
function patchReceipt(
  state: MessagesState,
  match: (message: ChatMessage) => boolean,
  userId: string,
  patch: { deliveredAt?: string; readAt?: string },
): MessagesState {
  let changed = false;
  const next: MessagesState = {};

  for (const [conversationId, list] of Object.entries(state)) {
    let listChanged = false;
    const updated = list.map((message) => {
      if (!match(message)) return message;
      listChanged = true;
      return {
        ...message,
        receipts: message.receipts.map((r) =>
          r.userId === userId
            ? {
                ...r,
                deliveredAt: r.deliveredAt ?? patch.deliveredAt ?? patch.readAt ?? null,
                readAt: r.readAt ?? patch.readAt ?? null,
              }
            : r,
        ),
      };
    });
    next[conversationId] = listChanged ? updated : list;
    if (listChanged) changed = true;
  }
  return changed ? next : state;
}

/** Met à jour l'aperçu d'une discussion avec un nouveau message */
function bumpConversation(
  list: ConversationSummary[],
  message: ChatMessage,
  meId: string,
  viewing: boolean,
): ConversationSummary[] {
  const index = list.findIndex((c) => c.id === message.conversationId);
  if (index === -1) return list;

  const current = list[index];
  const updated: ConversationSummary = {
    ...current,
    lastMessage: {
      content: message.deletedAt ? null : message.content,
      type: message.type,
      senderId: message.senderId,
      createdAt: message.createdAt,
      deleted: message.deletedAt !== null,
      attachment: message.attachment
        ? { fileName: message.attachment.fileName, durationMs: message.attachment.durationMs }
        : message.upload
          ? { fileName: message.upload.fileName, durationMs: message.upload.durationMs }
          : null,
      call: message.call,
    },
    lastMessageAt: message.createdAt,
    unreadCount:
      message.senderId !== meId && message.type !== "SYSTEM" && !viewing
        ? current.unreadCount + 1
        : current.unreadCount,
  };
  return list.map((c, i) => (i === index ? updated : c));
}

function upsertConversation(list: ConversationSummary[], summary: ConversationSummary) {
  return list.some((c) => c.id === summary.id)
    ? list.map((c) => (c.id === summary.id ? summary : c))
    : [summary, ...list];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function postConversation(body: unknown): Promise<ConversationSummary> {
  let response: Response;
  try {
    response = await fetch("/api/conversations", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  const data = (await response.json().catch(() => null)) as {
    conversation?: ConversationSummary;
    error?: string;
  } | null;
  if (!response.ok || !data?.conversation) {
    throw new Error(data?.error ?? "Impossible de créer cette discussion. Réessaie.");
  }
  return data.conversation;
}

export type AttachmentInput = {
  blob: Blob;
  type: AttachmentType;
  fileName: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  /** Message auquel ce fichier répond */
  replyTo?: ChatMessage | null;
};

/** Envoi d'un fichier avec suivi de la progression (fetch ne sait pas la mesurer) */
function uploadFile(
  conversationId: string,
  clientId: string,
  input: AttachmentInput,
  onProgress: (percent: number) => void,
): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/conversations/${conversationId}/attachments`);
    xhr.setRequestHeader("Content-Type", input.blob.type || "application/octet-stream");
    xhr.setRequestHeader("X-Message-Type", input.type);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(input.fileName));
    xhr.setRequestHeader("X-Client-Id", clientId);
    if (input.replyTo && !input.replyTo.localStatus) xhr.setRequestHeader("X-Reply-To", input.replyTo.id);
    if (input.durationMs) xhr.setRequestHeader("X-Duration-Ms", String(Math.round(input.durationMs)));
    if (input.width) xhr.setRequestHeader("X-Width", String(input.width));
    if (input.height) xhr.setRequestHeader("X-Height", String(input.height));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data: { message?: ChatMessage; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* réponse illisible */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.message) resolve(data.message);
      else reject(new Error(data.error ?? "L'envoi a échoué. Réessaie."));
    };
    xhr.onerror = () => reject(new Error(NETWORK_ERROR));
    xhr.ontimeout = () => reject(new Error(NETWORK_ERROR));
    xhr.send(input.blob);
  });
}

// --- Provider --------------------------------------------------------------------------

type ProviderProps = {
  me: UserLite;
  initialConversations: ConversationSummary[];
  children: React.ReactNode;
};

export default function ChatProvider({ me: initialMe, initialConversations, children }: ProviderProps) {
  const [me, setMe] = useState(initialMe);
  const [conversations, setConversations] = useState(() => sortConversations(initialConversations));
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [typingByConv, setTypingByConv] = useState<Record<string, string[]>>({});
  const [messagesByConv, setMessagesByConv] = useState<MessagesState>({});
  const [hasMoreByConv, setHasMoreByConv] = useState<Record<string, boolean>>({});
  const [hasNewerByConv, setHasNewerByConv] = useState<Record<string, boolean>>({});
  const [loadedByConv, setLoadedByConv] = useState<Record<string, boolean>>({});
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [starredIds, setStarredIds] = useState<ReadonlySet<string>>(new Set());

  // Copies lisibles depuis les gestionnaires d'événements sans les recréer
  const activeIdRef = useRef<string | null>(null);
  const meRef = useRef(me);
  const conversationsRef = useRef(conversations);
  const messagesRef = useRef(messagesByConv);
  const hasNewerRef = useRef(hasNewerByConv);
  const starredIdsRef = useRef(starredIds);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingFiles = useRef(new Map<string, AttachmentInput>());

  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    messagesRef.current = messagesByConv;
  }, [messagesByConv]);
  useEffect(() => {
    hasNewerRef.current = hasNewerByConv;
  }, [hasNewerByConv]);
  useEffect(() => {
    starredIdsRef.current = starredIds;
  }, [starredIds]);

  /** Toute modification de la liste passe par ici : les épinglées restent en haut, le reste par activité */
  const applyConversations = useCallback(
    (update: (list: ConversationSummary[]) => ConversationSummary[]) =>
      setConversations((prev) => sortConversations(update(prev))),
    [],
  );

  const applySummary = useCallback(
    (summary: ConversationSummary) => applyConversations((list) => upsertConversation(list, summary)),
    [applyConversations],
  );

  const setActiveConversation = useCallback((id: string | null) => {
    activeIdRef.current = id;
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = (await response.json()) as { conversations: ConversationSummary[] };
      setConversations(sortConversations(data.conversations));
    } catch {
      /* hors ligne : on garde la liste actuelle */
    }
  }, []);

  const setHasNewer = useCallback((conversationId: string, value: boolean) => {
    hasNewerRef.current = { ...hasNewerRef.current, [conversationId]: value };
    setHasNewerByConv((prev) => ({ ...prev, [conversationId]: value }));
  }, []);

  const loadLatest = useCallback(
    async (conversationId: string) => {
      // Si on regarde un extrait ancien, on repart des derniers messages
      const reset = hasNewerRef.current[conversationId] === true;
      const knownBefore = new Set(
        (messagesRef.current[conversationId] ?? []).filter((m) => !m.localStatus).map((m) => m.id),
      );
      try {
        const response = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!response.ok) return;
        const data = (await response.json()) as { messages: ChatMessage[]; hasMore: boolean };
        setMessagesByConv((prev) => {
          const current = prev[conversationId] ?? [];
          return {
            ...prev,
            [conversationId]: reset
              ? mergeMessages(
                  current.filter((m) => m.localStatus),
                  data.messages,
                )
              : mergeLatest(current, data.messages, data.hasMore, knownBefore),
          };
        });
        setHasMoreByConv((prev) =>
          reset || !(conversationId in prev) ? { ...prev, [conversationId]: data.hasMore } : prev,
        );
        if (reset) setHasNewer(conversationId, false);
      } catch {
        /* hors ligne : on affichera ce qu'on a déjà */
      } finally {
        setLoadedByConv((prev) => ({ ...prev, [conversationId]: true }));
      }
    },
    [setHasNewer],
  );

  const loadOlder = useCallback(async (conversationId: string) => {
    const oldest = (messagesRef.current[conversationId] ?? []).find((m) => !m.localStatus);
    if (!oldest) return;
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages?before=${oldest.id}`);
      if (!response.ok) return;
      const data = (await response.json()) as { messages: ChatMessage[]; hasMore: boolean };
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: mergeMessages(prev[conversationId] ?? [], data.messages),
      }));
      setHasMoreByConv((prev) => ({ ...prev, [conversationId]: data.hasMore }));
    } catch {
      /* on réessaiera au prochain clic */
    }
  }, []);

  const loadAround = useCallback(
    async (conversationId: string, messageId: string) => {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages?around=${encodeURIComponent(messageId)}`,
        );
        if (!response.ok) return false;
        const data = (await response.json()) as { messages: ChatMessage[]; hasMore: boolean; hasNewer: boolean };
        const pending = (messagesRef.current[conversationId] ?? []).filter((m) => m.localStatus);
        setMessagesByConv((prev) => ({
          ...prev,
          [conversationId]: data.hasNewer ? data.messages : mergeMessages(pending, data.messages),
        }));
        setHasMoreByConv((prev) => ({ ...prev, [conversationId]: data.hasMore }));
        setHasNewer(conversationId, data.hasNewer);
        setLoadedByConv((prev) => ({ ...prev, [conversationId]: true }));
        return true;
      } catch {
        return false;
      }
    },
    [setHasNewer],
  );

  // « En train d'écrire » : s'éteint tout seul si l'arrêt n'arrive jamais
  const setTypingFlag = useCallback((conversationId: string, userId: string, isTyping: boolean) => {
    const key = `${conversationId}:${userId}`;
    const existing = typingTimers.current.get(key);
    if (existing) clearTimeout(existing);

    if (isTyping) {
      typingTimers.current.set(
        key,
        setTimeout(() => setTypingFlag(conversationId, userId, false), 6000),
      );
    } else {
      typingTimers.current.delete(key);
    }

    setTypingByConv((prev) => {
      const current = prev[conversationId] ?? [];
      if (isTyping === current.includes(userId)) return prev;
      return {
        ...prev,
        [conversationId]: isTyping ? [...current, userId] : current.filter((id) => id !== userId),
      };
    });
  }, []);

  /** Un message a changé (modifié, supprimé, réaction) : on le remplace partout où il est affiché */
  const applyMessageUpdate = useCallback(
    (message: ChatMessage) => {
      setMessagesByConv((prev) => {
        const list = prev[message.conversationId];
        if (!list || !list.some((m) => m.id === message.id)) return prev;
        return {
          ...prev,
          [message.conversationId]: list.map((m) => (m.id === message.id ? message : m)),
        };
      });
      // L'aperçu de la liste suit si c'était le dernier message
      applyConversations((list) =>
        list.map((c) => {
          const last = c.lastMessage;
          if (c.id !== message.conversationId || !last) return c;
          if (last.createdAt !== message.createdAt || last.senderId !== message.senderId) return c;
          return {
            ...c,
            lastMessage: {
              ...last,
              content: message.deletedAt ? null : message.content,
              deleted: message.deletedAt !== null,
              attachment: message.deletedAt ? null : last.attachment,
            },
          };
        }),
      );
    },
    [applyConversations],
  );

  const removeMessages = useCallback((conversationId: string, ids: string[]) => {
    const gone = new Set(ids);
    setMessagesByConv((prev) => {
      const list = prev[conversationId];
      if (!list || !list.some((m) => gone.has(m.id))) return prev;
      return { ...prev, [conversationId]: list.filter((m) => !gone.has(m.id)) };
    });
  }, []);

  // --- Connexion temps réel ---
  useEffect(() => {
    const socket = getSocket();
    const meId = initialMe.id;
    let firstConnect = true;
    const timers = typingTimers.current;

    const onConnect = () => {
      setConnected(true);
      // Après une coupure : on rattrape ce qui a été manqué
      if (!firstConnect) {
        void refreshConversations();
        const active = activeIdRef.current;
        if (active && !hasNewerRef.current[active]) void loadLatest(active);
      }
      firstConnect = false;
    };

    const onDisconnect = () => setConnected(false);

    const onNewMessage = (message: ChatMessage) => {
      // Pendant qu'on regarde un extrait ancien, les nouveaux messages attendent (bouton « derniers messages »)
      if (!hasNewerRef.current[message.conversationId]) {
        setMessagesByConv((prev) =>
          prev[message.conversationId]
            ? { ...prev, [message.conversationId]: upsertMessage(prev[message.conversationId], message) }
            : prev,
        );
      }

      if (!conversationsRef.current.some((c) => c.id === message.conversationId)) {
        void refreshConversations();
        return;
      }

      const viewing =
        activeIdRef.current === message.conversationId && document.visibilityState === "visible";
      applyConversations((list) => bumpConversation(list, message, meId, viewing));

      if (message.senderId !== meId) {
        setTypingFlag(message.conversationId, message.senderId, false);
        if (viewing && message.type !== "SYSTEM") {
          socket.emit("message:read", { conversationId: message.conversationId });
        }
      }
    };

    const onMessageUpdated = (message: ChatMessage) => applyMessageUpdate(message);

    const onMessageHidden = (data: { conversationId: string; messageId: string }) => {
      removeMessages(data.conversationId, [data.messageId]);
      void refreshConversations();
    };

    const onMessageExpired = (data: { conversationId: string; ids: string[] }) => {
      removeMessages(data.conversationId, data.ids);
      void refreshConversations();
    };

    const onDelivered = (data: { messageId: string; userId: string; at: string }) => {
      setMessagesByConv((prev) =>
        patchReceipt(prev, (m) => m.id === data.messageId, data.userId, { deliveredAt: data.at }),
      );
    };

    const onRead = (data: { conversationId: string; userId: string; at: string }) => {
      setMessagesByConv((prev) =>
        patchReceipt(
          prev,
          (m) => m.conversationId === data.conversationId && m.senderId !== data.userId,
          data.userId,
          { readAt: data.at },
        ),
      );
      // Lu depuis un autre appareil à moi : le compteur retombe à zéro ici aussi
      if (data.userId === meId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === data.conversationId && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c,
          ),
        );
      }
    };

    const onNewConversation = (summary: ConversationSummary) => {
      applyConversations((list) => (list.some((c) => c.id === summary.id) ? list : [summary, ...list]));
    };

    const onConversationUpdated = (summary: ConversationSummary) => applySummary(summary);

    const onConversationRemoved = (data: { id: string }) => {
      applyConversations((list) => list.filter((c) => c.id !== data.id));
      setMessagesByConv((prev) => {
        if (!(data.id in prev)) return prev;
        const next = { ...prev };
        delete next[data.id];
        return next;
      });
    };

    // Un contact (ou moi, depuis un autre appareil) a changé son nom, sa photo ou son info
    const onUserUpdated = (user: UserLite) => {
      if (user.id === meId) setMe((prev) => ({ ...prev, ...user }));
      applyConversations((list) =>
        list.map((c) => {
          if (!c.participants.some((p) => p.id === user.id)) return c;
          const direct = !c.isGroup && c.otherUserId === user.id;
          return {
            ...c,
            participants: c.participants.map((p) => (p.id === user.id ? { ...p, ...user } : p)),
            ...(direct ? { name: user.displayName, avatarUrl: user.avatarUrl } : {}),
          };
        }),
      );
    };

    // Un favori ajouté ou retiré depuis un autre de mes appareils
    const onStarUpdated = (data: { messageId: string; starred: boolean }) => {
      setStarredIds((prev) => {
        if (prev.has(data.messageId) === data.starred) return prev;
        const next = new Set(prev);
        if (data.starred) next.add(data.messageId);
        else next.delete(data.messageId);
        return next;
      });
    };

    const onPresence = (data: { userId: string; online: boolean; lastSeenAt?: string }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (data.online) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
      if (!data.online && data.lastSeenAt) {
        setLastSeen((prev) => ({ ...prev, [data.userId]: data.lastSeenAt as string }));
      }
    };

    const onPresenceList = (ids: string[]) => setOnlineIds(new Set(ids));

    const onTyping = (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      setTypingFlag(data.conversationId, data.userId, data.isTyping);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onNewMessage);
    socket.on("message:updated", onMessageUpdated);
    socket.on("message:hidden", onMessageHidden);
    socket.on("message:expired", onMessageExpired);
    socket.on("message:delivered", onDelivered);
    socket.on("message:read", onRead);
    socket.on("conversation:new", onNewConversation);
    socket.on("conversation:updated", onConversationUpdated);
    socket.on("conversation:removed", onConversationRemoved);
    socket.on("user:updated", onUserUpdated);
    socket.on("star:updated", onStarUpdated);
    socket.on("presence", onPresence);
    socket.on("presence:list", onPresenceList);
    socket.on("typing", onTyping);

    if (!socket.connected) socket.connect();
    else setConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onNewMessage);
      socket.off("message:updated", onMessageUpdated);
      socket.off("message:hidden", onMessageHidden);
      socket.off("message:expired", onMessageExpired);
      socket.off("message:delivered", onDelivered);
      socket.off("message:read", onRead);
      socket.off("conversation:new", onNewConversation);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("conversation:removed", onConversationRemoved);
      socket.off("user:updated", onUserUpdated);
      socket.off("star:updated", onStarUpdated);
      socket.off("presence", onPresence);
      socket.off("presence:list", onPresenceList);
      socket.off("typing", onTyping);
      socket.disconnect();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [
    initialMe.id,
    refreshConversations,
    loadLatest,
    setTypingFlag,
    applyConversations,
    applySummary,
    applyMessageUpdate,
    removeMessages,
  ]);

  // --- Envoi ---

  /** Version réduite d'un message pour l'afficher en citation avant même la réponse du serveur */
  const toQuoted = useCallback((message: ChatMessage): QuotedMessage => {
    const participants = conversationsRef.current.find((c) => c.id === message.conversationId)?.participants;
    const senderName =
      message.sender?.displayName ?? participants?.find((p) => p.id === message.senderId)?.displayName ?? "";
    return {
      id: message.id,
      type: message.type,
      content: message.deletedAt ? null : message.content,
      senderId: message.senderId,
      deletedAt: message.deletedAt,
      sender: { displayName: senderName },
      attachment: message.attachment
        ? { fileName: message.attachment.fileName }
        : message.upload
          ? { fileName: message.upload.fileName }
          : null,
    };
  }, []);

  const emitSend = useCallback((message: ChatMessage) => {
    const socket = getSocket();
    // Hors ligne, l'envoi est réessayé jusqu'à la reconnexion (le clientId évite les doublons)
    socket
      .timeout(socket.connected ? 15_000 : 120_000)
      .emit(
        "message:send",
        {
          conversationId: message.conversationId,
          content: message.content,
          clientId: message.clientId,
          replyToId: message.replyTo?.id,
        },
        (error: unknown, ack?: SendMessageAck) => {
          if (error || !ack || !ack.ok) {
            setMessagesByConv((prev) => ({
              ...prev,
              [message.conversationId]: (prev[message.conversationId] ?? []).map((m) =>
                m.clientId === message.clientId && m.localStatus
                  ? { ...m, localStatus: "failed" as const }
                  : m,
              ),
            }));
            return;
          }
          setMessagesByConv((prev) => ({
            ...prev,
            [message.conversationId]: upsertMessage(prev[message.conversationId] ?? [], ack.message),
          }));
        },
      );
  }, []);

  /** Valeurs communes à tous les messages que j'envoie, avant la confirmation du serveur */
  const baseLocalMessage = useCallback(
    (conversationId: string, clientId: string): Omit<ChatMessage, "type" | "content" | "replyTo"> => ({
      id: `local-${clientId}`,
      clientId,
      conversationId,
      senderId: meRef.current.id,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      expiresAt: null,
      forwarded: false,
      linkPreview: null,
      reactions: [],
      receipts: [],
      attachment: null,
      call: null,
      localStatus: "pending",
    }),
    [],
  );

  const sendMessage = useCallback(
    (conversationId: string, text: string, replyTo?: ChatMessage | null) => {
      const content = text.trim();
      if (!content) return;

      const clientId = uid();
      // On ne peut citer qu'un message déjà enregistré
      const quoted = replyTo && !replyTo.localStatus ? toQuoted(replyTo) : null;
      const message: ChatMessage = {
        ...baseLocalMessage(conversationId, clientId),
        type: "TEXT",
        content,
        replyTo: quoted,
      };
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: upsertMessage(prev[conversationId] ?? [], message),
      }));
      emitSend(message);
      // Écrire depuis un extrait ancien : on revient d'abord aux derniers messages
      if (hasNewerRef.current[conversationId]) void loadLatest(conversationId);
    },
    [baseLocalMessage, emitSend, loadLatest, toQuoted],
  );

  const runUpload = useCallback(async (message: ChatMessage) => {
    const clientId = message.clientId as string;
    const { conversationId } = message;
    const input = pendingFiles.current.get(clientId);
    if (!input) return;

    const patch = (update: (m: ChatMessage) => ChatMessage) =>
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] ?? []).map((m) =>
          m.clientId === clientId && m.localStatus ? update(m) : m,
        ),
      }));

    let last = 0;
    try {
      const saved = await uploadFile(conversationId, clientId, input, (percent) => {
        if (percent < 100 && percent - last < 5) return;
        last = percent;
        patch((m) => (m.upload ? { ...m, upload: { ...m.upload, progress: percent } } : m));
      });
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: upsertMessage(prev[conversationId] ?? [], saved),
      }));
      pendingFiles.current.delete(clientId);
      if (message.upload?.previewUrl) URL.revokeObjectURL(message.upload.previewUrl);
    } catch (error) {
      patch((m) => ({
        ...m,
        localStatus: "failed",
        localError: error instanceof Error ? error.message : "L'envoi a échoué. Réessaie.",
      }));
    }
  }, []);

  const sendAttachment = useCallback(
    async (conversationId: string, input: AttachmentInput) => {
      if (input.blob.size === 0) return "Ce fichier est vide.";
      if (input.blob.size > MAX_UPLOAD_BYTES) return `Ce fichier dépasse la limite de ${MAX_UPLOAD_MB} Mo.`;

      const clientId = uid();
      const quoted = input.replyTo && !input.replyTo.localStatus ? toQuoted(input.replyTo) : null;
      const message: ChatMessage = {
        ...baseLocalMessage(conversationId, clientId),
        type: input.type,
        content: null,
        replyTo: quoted,
        upload: {
          progress: 0,
          previewUrl: input.type === "FILE" ? null : URL.createObjectURL(input.blob),
          fileName: input.fileName,
          size: input.blob.size,
          mimeType: input.blob.type || "application/octet-stream",
          durationMs: input.durationMs ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
        },
      };

      pendingFiles.current.set(clientId, input);
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: upsertMessage(prev[conversationId] ?? [], message),
      }));
      void runUpload(message);
      if (hasNewerRef.current[conversationId]) void loadLatest(conversationId);
      return null;
    },
    [baseLocalMessage, loadLatest, runUpload, toQuoted],
  );

  const retryMessage = useCallback(
    (conversationId: string, clientId: string) => {
      const message = (messagesRef.current[conversationId] ?? []).find(
        (m) => m.clientId === clientId && m.localStatus === "failed",
      );
      if (!message) return;
      const retrying: ChatMessage = {
        ...message,
        localStatus: "pending",
        localError: undefined,
        upload: message.upload ? { ...message.upload, progress: 0 } : undefined,
      };
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: upsertMessage(prev[conversationId] ?? [], retrying),
      }));
      if (retrying.upload) void runUpload(retrying);
      else emitSend(retrying);
    },
    [emitSend, runUpload],
  );

  const discardMessage = useCallback((conversationId: string, clientId: string) => {
    const message = (messagesRef.current[conversationId] ?? []).find(
      (m) => m.clientId === clientId && m.localStatus,
    );
    if (message?.upload?.previewUrl) URL.revokeObjectURL(message.upload.previewUrl);
    pendingFiles.current.delete(clientId);
    setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] ?? []).filter(
        (m) => !(m.clientId === clientId && m.localStatus),
      ),
    }));
  }, []);

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    const socket = getSocket();
    if (socket.connected) socket.emit("typing", { conversationId, isTyping });
  }, []);

  const markRead = useCallback(
    (conversationId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation || conversation.unreadCount === 0) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
      const socket = getSocket();
      if (socket.connected) socket.emit("message:read", { conversationId });
    },
    [],
  );

  const openDirectChat = useCallback(
    async (userId: string) => {
      const conversation = await postConversation({ userId });
      applyConversations((list) => (list.some((c) => c.id === conversation.id) ? list : [conversation, ...list]));
      return conversation.id;
    },
    [applyConversations],
  );

  const createGroup = useCallback(
    async (name: string, userIds: string[]) => {
      const conversation = await postConversation({ name, userIds });
      applyConversations((list) => (list.some((c) => c.id === conversation.id) ? list : [conversation, ...list]));
      return conversation.id;
    },
    [applyConversations],
  );

  // --- Actions sur les messages ---

  const editMessage = useCallback(
    async (_conversationId: string, messageId: string, content: string) => {
      const result = await apiRequest<{ message: ChatMessage }>(`/api/messages/${messageId}`, {
        method: "PATCH",
        json: { content },
      });
      if (!result.ok) return result.error;
      applyMessageUpdate(result.data.message);
      return null;
    },
    [applyMessageUpdate],
  );

  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string, scope: "me" | "all") => {
      const result = await apiRequest<{ message?: ChatMessage }>(`/api/messages/${messageId}?scope=${scope}`, {
        method: "DELETE",
      });
      if (!result.ok) return result.error;
      if (scope === "all" && result.data.message) {
        applyMessageUpdate(result.data.message);
      } else {
        removeMessages(conversationId, [messageId]);
        void refreshConversations();
      }
      return null;
    },
    [applyMessageUpdate, removeMessages, refreshConversations],
  );

  const reactToMessage = useCallback(
    async (conversationId: string, messageId: string, emoji: string | null) => {
      const meId = meRef.current.id;
      const before = (messagesRef.current[conversationId] ?? []).find((m) => m.id === messageId);
      if (!before) return null;

      // Affichage immédiat ; on revient en arrière si le serveur refuse
      const mine = before.reactions.find((r) => r.userId === meId)?.emoji ?? null;
      const next = emoji === null || emoji === mine ? null : emoji;
      const show = (reactions: Reaction[]) =>
        setMessagesByConv((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        }));
      const others = before.reactions.filter((r) => r.userId !== meId);
      show(next ? [...others, { userId: meId, emoji: next }] : others);

      const result = await apiRequest(`/api/messages/${messageId}/reaction`, {
        method: "PUT",
        json: { emoji: next },
      });
      if (!result.ok) {
        show(before.reactions);
        return result.error;
      }
      return null;
    },
    [],
  );

  const forwardMessage = useCallback(async (messageId: string, conversationIds: string[]) => {
    const result = await apiRequest(`/api/messages/${messageId}/forward`, {
      method: "POST",
      json: { conversationIds },
    });
    return result.ok ? null : result.error;
  }, []);

  // --- Réglages et groupes ---

  /** Appelle une route qui renvoie la discussion à jour, et l'applique */
  const callConversationRoute = useCallback(
    async (url: string, init: { method: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> }) => {
      const result = await apiRequest<{ conversation?: ConversationSummary | null }>(url, init);
      if (!result.ok) return result.error;
      if (result.data.conversation) applySummary(result.data.conversation);
      return null;
    },
    [applySummary],
  );

  const setBlocked = useCallback(
    (userId: string, blocked: boolean) =>
      callConversationRoute(`/api/users/${userId}/block`, { method: blocked ? "POST" : "DELETE" }),
    [callConversationRoute],
  );

  const updateConversationSettings = useCallback(
    (conversationId: string, patch: ConversationSettingsPatch) =>
      callConversationRoute(`/api/conversations/${conversationId}/settings`, { method: "PATCH", json: patch }),
    [callConversationRoute],
  );

  const updateGroup = useCallback(
    (conversationId: string, patch: GroupPatch) =>
      callConversationRoute(`/api/conversations/${conversationId}`, { method: "PATCH", json: patch }),
    [callConversationRoute],
  );

  const addMembers = useCallback(
    (conversationId: string, userIds: string[]) =>
      callConversationRoute(`/api/conversations/${conversationId}/members`, { method: "POST", json: { userIds } }),
    [callConversationRoute],
  );

  const setMemberRole = useCallback(
    (conversationId: string, userId: string, role: ParticipantRole) =>
      callConversationRoute(`/api/conversations/${conversationId}/members/${userId}`, {
        method: "PATCH",
        json: { role },
      }),
    [callConversationRoute],
  );

  const removeMember = useCallback(
    async (conversationId: string, userId: string) => {
      const result = await apiRequest(`/api/conversations/${conversationId}/members/${userId}`, {
        method: "DELETE",
      });
      if (!result.ok) return result.error;
      // Je quitte le groupe : il disparaît de ma liste (les autres appareils l'apprennent par le serveur)
      if (userId === meRef.current.id) applyConversations((list) => list.filter((c) => c.id !== conversationId));
      return null;
    },
    [applyConversations],
  );

  const setGroupAvatar = useCallback(
    (conversationId: string, photo: Blob | null) =>
      callConversationRoute(
        `/api/conversations/${conversationId}/avatar`,
        photo
          ? { method: "POST", body: photo, headers: { "Content-Type": photo.type || "image/jpeg" } }
          : { method: "DELETE" },
      ),
    [callConversationRoute],
  );

  // --- Favoris ---

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ ids: string[] }>("/api/messages/starred?ids=1").then((result) => {
      if (!cancelled && result.ok) setStarredIds(new Set(result.data.ids));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStar = useCallback(async (messageId: string) => {
    const starred = !starredIdsRef.current.has(messageId);
    // Affichage immédiat ; on revient en arrière si le serveur refuse
    const show = (value: boolean) =>
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (value) next.add(messageId);
        else next.delete(messageId);
        return next;
      });
    show(starred);
    const result = await apiRequest(`/api/messages/${messageId}/star`, { method: "PUT", json: { starred } });
    if (!result.ok) {
      show(!starred);
      return result.error;
    }
    return null;
  }, []);

  // --- Mon profil ---

  const updateProfile = useCallback(async (patch: { displayName?: string; about?: string }) => {
    const result = await apiRequest<{ user: UserLite }>("/api/profile", { method: "PATCH", json: patch });
    if (!result.ok) return result.error;
    setMe((prev) => ({ ...prev, ...result.data.user }));
    return null;
  }, []);

  const setMyAvatar = useCallback(async (photo: Blob | null) => {
    const result = await apiRequest<{ user: UserLite }>(
      "/api/profile/avatar",
      photo
        ? { method: "POST", body: photo, headers: { "Content-Type": photo.type || "image/jpeg" } }
        : { method: "DELETE" },
    );
    if (!result.ok) return result.error;
    setMe((prev) => ({ ...prev, ...result.data.user }));
    return null;
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
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
      sendMessage,
      retryMessage,
      sendAttachment,
      discardMessage,
      sendTyping,
      markRead,
      openDirectChat,
      createGroup,
      editMessage,
      deleteMessage,
      reactToMessage,
      forwardMessage,
      setBlocked,
      updateConversationSettings,
      updateGroup,
      addMembers,
      setMemberRole,
      removeMember,
      setGroupAvatar,
      updateProfile,
      setMyAvatar,
      starredIds,
      toggleStar,
      newChatOpen,
      setNewChatOpen,
    }),
    [
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
      sendMessage,
      retryMessage,
      sendAttachment,
      discardMessage,
      sendTyping,
      markRead,
      openDirectChat,
      createGroup,
      editMessage,
      deleteMessage,
      reactToMessage,
      forwardMessage,
      setBlocked,
      updateConversationSettings,
      updateGroup,
      addMembers,
      setMemberRole,
      removeMember,
      setGroupAvatar,
      updateProfile,
      setMyAvatar,
      starredIds,
      toggleStar,
      newChatOpen,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
