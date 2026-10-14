// Types partagés entre le serveur (API, temps réel) et l'interface.
// Les dates sont toujours des chaînes ISO : c'est ce qui circule en JSON et par socket.

export type UserLite = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  about?: string | null;
  lastSeenAt?: string | null;
};

export type ParticipantRole = "MEMBER" | "ADMIN";

/** Membre d'une discussion : le profil, plus son rôle dans le groupe */
export type MemberLite = UserLite & { role: ParticipantRole };

export type Receipt = {
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export type Reaction = {
  userId: string;
  emoji: string;
};

export type MessageType = "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "FILE" | "POLL" | "CALL" | "SYSTEM";
export type AttachmentType = "IMAGE" | "AUDIO" | "VIDEO" | "FILE";
export type CallKind = "AUDIO" | "VIDEO";
export type CallStatus = "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "DECLINED";

export type AttachmentInfo = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

export type CallInfo = {
  kind: CallKind;
  status: CallStatus;
  durationSec: number | null;
  /** Null pour un appel de groupe */
  calleeId: string | null;
};

/** Aperçu d'un lien : récupéré par le serveur après l'envoi du message */
export type LinkPreview = {
  url: string;
  title: string;
  description: string | null;
  siteName: string | null;
  /** Adresse d'origine de l'image ; elle s'affiche toujours via notre serveur, jamais directement */
  imageUrl: string | null;
};

/** Le message auquel on répond : juste de quoi l'afficher en citation */
export type QuotedMessage = {
  id: string;
  type: MessageType;
  content: string | null;
  senderId: string;
  deletedAt: string | null;
  sender: { displayName: string };
  attachment: { fileName: string } | null;
};

/** Envoi en cours d'un fichier : n'existe que sur l'appareil de l'expéditeur */
export type LocalUpload = {
  progress: number;
  previewUrl: string | null;
  fileName: string;
  size: number;
  mimeType: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

export type ChatMessage = {
  id: string;
  clientId: string | null;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  createdAt: string;
  editedAt: string | null;
  /** Renseigné quand le message a été supprimé pour tout le monde */
  deletedAt: string | null;
  /** Messages éphémères : date de disparition */
  expiresAt: string | null;
  forwarded: boolean;
  /** Personnes citées par « @pseudo » (absent sur les messages pas encore confirmés) */
  mentionedIds?: string[];
  /** Sondage : question, réponses et qui a voté pour quoi */
  poll?: { question: string; multiple: boolean; options: { id: string; text: string; votes: { userId: string }[] }[] } | null;
  /** Réponse à un statut : extrait du statut cité */
  statusQuote?: string | null;
  linkPreview: LinkPreview | null;
  replyTo: QuotedMessage | null;
  reactions: Reaction[];
  sender?: Pick<UserLite, "id" | "displayName" | "avatarUrl">;
  receipts: Receipt[];
  attachment: AttachmentInfo | null;
  call: CallInfo | null;
  /** État local, uniquement pour les messages pas encore confirmés par le serveur */
  localStatus?: "pending" | "failed";
  localError?: string;
  upload?: LocalUpload;
};

/** Message épinglé, tel qu'il apparaît dans la barre en haut de la discussion */
export type PinnedMessage = {
  id: string;
  /** Extrait lisible : le texte, ou « Photo », « Message vocal »… */
  preview: string;
  senderName: string;
  pinnedAt: string;
};

export type ConversationSummary = {
  id: string;
  isGroup: boolean;
  /** Nom affiché : nom du groupe, ou nom de l'autre personne en 1-à-1 */
  name: string;
  /** Description du groupe */
  description: string | null;
  avatarUrl: string | null;
  participants: MemberLite[];
  /** En 1-à-1 : l'identifiant de l'autre personne */
  otherUserId: string | null;
  /** Mon rôle dans la discussion */
  myRole: ParticipantRole;
  /** Durée de vie des messages en secondes (null = messages éphémères désactivés) */
  disappearingSeconds: number | null;
  /** En 1-à-1 : j'ai bloqué l'autre personne (on n'indique jamais l'inverse) */
  blockedByMe: boolean;
  /** Groupe : un message non lu me cite par « @pseudo » */
  hasUnreadMention: boolean;
  /** Messages épinglés, le plus récemment épinglé en premier */
  pinnedMessages: PinnedMessage[];
  /** Réglages personnels */
  pinnedAt: string | null;
  archivedAt: string | null;
  mutedUntil: string | null;
  unreadCount: number;
  lastMessage: {
    content: string | null;
    type: MessageType;
    senderId: string;
    createdAt: string;
    deleted: boolean;
    attachment: { fileName: string; durationMs: number | null } | null;
    call: CallInfo | null;
  } | null;
  lastMessageAt: string;
};

export type SendMessageAck =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string };

/** Résultat d'une recherche de messages */
export type SearchHit = {
  id: string;
  conversationId: string;
  conversationName: string;
  conversationAvatarUrl: string | null;
  isGroup: boolean;
  otherUserId: string | null;
  senderId: string;
  senderName: string;
  type: MessageType;
  content: string | null;
  fileName: string | null;
  createdAt: string;
};

/** Appel de groupe en cours dans une discussion */
export type OngoingGroupCall = {
  callId: string;
  conversationId: string;
  kind: CallKind;
  participantIds: string[];
};

export type CallPerson = { id: string; displayName: string; avatarUrl: string | null };
