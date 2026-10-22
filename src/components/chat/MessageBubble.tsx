"use client";

import { useState, type CSSProperties } from "react";
import {
  Ban,
  Check,
  CheckCheck,
  CircleAlert,
  CircleDashed,
  Reply,
  Clock,
  Download,
  FileText,
  Forward,
  ChevronDown,
  Star,
} from "lucide-react";
import { useDataSaver } from "@/hooks/useDataSaver";
import Avatar from "./Avatar";
import { useLongPress } from "@/hooks/useLongPress";
import { useSwipeToReply } from "@/hooks/useSwipeToReply";
import { formatBytes, formatTime } from "@/lib/format";
import type { MessageStatus } from "@/lib/message-status";
import { hueFromId } from "@/lib/utils";
import { isEmojiOnly } from "@/lib/formatting";
import type { ChatMessage } from "@/types/chat";
import ImageViewer from "./ImageViewer";
import LinkCard from "./LinkCard";
import PollBlock from "./PollBlock";
import Linkify from "./Linkify";
import QuotedBlock from "./QuotedBlock";
import VoicePlayer from "./VoicePlayer";

type BubbleProps = {
  message: ChatMessage;
  mine: boolean;
  /** Affiche le nom de l'expéditeur (groupes, premier message d'une série) */
  showSender: boolean;
  senderName: string;
  /** Dernier message d'une série : le coin du bas pointe vers l'expéditeur */
  tail: boolean;
  status: MessageStatus;
  meId: string;
  /** Pseudos des membres d'un groupe (pour mettre les @mentions en valeur) et le mien */
  mentionable?: Set<string>;
  meUsername?: string;
  /** Dans mes favoris */
  starred?: boolean;
  /** Mis en évidence après un saut vers ce message (recherche, citation) */
  highlighted?: boolean;
  onRetry?: () => void;
  onDiscard?: () => void;
  onOpenMenu?: () => void;
  onReplyClick?: (messageId: string) => void;
  onReact?: (emoji: string) => void;
  /** Glisser le message vers la droite pour y répondre (absent : le geste est désactivé) */
  onSwipeReply?: () => void;
  /** Mode sélection : une case à cocher, et un toucher sur la ligne coche ou décoche le message */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Sondage : envoyer mes choix */
  onVote?: (optionIds: string[]) => Promise<string | null>;
};

const STATUS_LABEL: Record<MessageStatus, string> = {
  pending: "En cours d'envoi",
  failed: "Échec de l'envoi",
  sent: "Envoyé",
  delivered: "Reçu",
  read: "Lu",
};

function StatusIcon({ status }: { status: MessageStatus }) {
  const icon =
    status === "pending" ? (
      <Clock size={13} aria-hidden="true" />
    ) : status === "failed" ? (
      <CircleAlert size={14} aria-hidden="true" className="text-danger" />
    ) : status === "sent" ? (
      <Check size={14} aria-hidden="true" />
    ) : (
      <CheckCheck size={15} aria-hidden="true" className={status === "read" ? "text-accent" : ""} />
    );
  return (
    <span className="inline-flex">
      {icon}
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

/** Ce qu'on affiche d'un média : version enregistrée sur le serveur, ou envoi en cours */
function mediaOf(message: ChatMessage) {
  if (message.attachment) {
    const a = message.attachment;
    return {
      src: `/api/attachments/${a.id}`,
      fileName: a.fileName,
      size: a.size,
      durationMs: a.durationMs,
      width: a.width,
      height: a.height,
      uploading: false,
    };
  }
  if (message.upload) {
    const u = message.upload;
    return {
      src: u.previewUrl,
      fileName: u.fileName,
      size: u.size,
      durationMs: u.durationMs,
      width: u.width,
      height: u.height,
      uploading: message.localStatus === "pending",
    };
  }
  return null;
}

export default function MessageBubble({
  message,
  mine,
  showSender,
  senderName,
  tail,
  status,
  meId,
  mentionable,
  meUsername,
  starred = false,
  highlighted = false,
  onRetry,
  onDiscard,
  onOpenMenu,
  onReplyClick,
  onReact,
  onSwipeReply,
  onVote,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: BubbleProps) {
  const [viewing, setViewing] = useState(false);
  const isDeleted = message.deletedAt !== null;
  // Fichier supprimé par l'administrateur pour libérer de l'espace : le message reste, avec une mention
  const purged = !isDeleted && Boolean(message.attachment?.purgedAt);
  const media = isDeleted || purged ? null : mediaOf(message);
  const canOpenMenu = !!onOpenMenu && !message.localStatus;
  const press = useLongPress(() => {
    if (canOpenMenu) onOpenMenu?.();
  });
  const dataSaver = useDataSaver();
  const [loadAnyway, setLoadAnyway] = useState(false);
  // Économie de données : les photos des autres attendent un toucher (les tiennes s'affichent toujours)
  const holdImage = dataSaver.active && !loadAnyway && !mine;
  const swipe = useSwipeToReply(onSwipeReply && !isDeleted && !message.localStatus ? onSwipeReply : undefined);

  // Réactions regroupées par emoji
  const reactionGroups = new Map<string, { count: number; mine: boolean }>();
  for (const reaction of message.reactions) {
    const entry = reactionGroups.get(reaction.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (reaction.userId === meId) entry.mine = true;
    reactionGroups.set(reaction.emoji, entry);
  }
  const isMedia = media !== null && (message.type === "IMAGE" || message.type === "VIDEO");

  const radius = 18;
  const style: CSSProperties = {
    borderRadius: radius,
    ...(tail ? (mine ? { borderBottomRightRadius: 5 } : { borderBottomLeftRadius: 5 }) : {}),
  };

  const metaTone = mine ? "text-bubble-out-ink/70" : "text-muted";
  const progress = message.upload?.progress ?? 0;

  const meta = (
    <>
      {starred && !isDeleted ? <Star size={11} aria-label="Favori" className="fill-current" /> : null}
      {message.editedAt && !isDeleted ? <span>modifié</span> : null}
      <time dateTime={message.createdAt} suppressHydrationWarning>
        {formatTime(message.createdAt)}
      </time>
      {mine ? <StatusIcon status={status} /> : null}
    </>
  );

  return (
    <div
      id={`msg-${message.id}`}
      {...swipe.handlers}
      style={swipe.style}
      {...(selectionMode
        ? {
            role: "checkbox",
            "aria-checked": selected,
            "aria-label": "Sélectionner ce message",
            tabIndex: 0,
            onClick: onToggleSelect,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onToggleSelect?.();
              }
            },
          }
        : {})}
      className={`group relative flex flex-col ${mine ? "items-end" : "items-start"} ${tail ? "mb-2" : "mb-0.5"} ${
        highlighted ? "rounded-2xl bg-accent/25 transition-colors" : ""
      } ${selectionMode ? "cursor-pointer pl-8 [&>*]:pointer-events-none" : ""} ${
        selected ? "rounded-xl bg-brand/10" : ""
      }`}
    >
      {selectionMode ? (
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 ${
            selected ? "border-brand bg-brand text-brand-ink" : "border-muted/60 bg-panel"
          }`}
        >
          {selected ? <Check size={14} strokeWidth={3} /> : null}
        </span>
      ) : null}
      {swipe.progress > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -left-10 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-panel text-brand shadow"
          style={{ opacity: swipe.progress, transform: `translateY(-50%) scale(${0.6 + swipe.progress * 0.4})` }}
        >
          <Reply size={16} />
        </span>
      ) : null}
      <div
        style={style}
        {...(canOpenMenu ? press : {})}
        className={`relative flow-root [-webkit-touch-callout:none] max-w-[82%] overflow-hidden text-[15px] leading-snug md:max-w-[68%] ${
          isMedia ? "p-1" : "px-3 pb-1.5 pt-1.5"
        } ${mine ? "bg-bubble-out text-bubble-out-ink" : "bg-bubble-in text-ink"}`}
      >
        {canOpenMenu ? (
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Options du message"
            className="absolute right-1 top-1 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-black/30 text-white opacity-0 hover:bg-black/45 focus-visible:opacity-100 group-hover:opacity-100 md:inline-flex"
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        ) : null}

        {showSender ? (
          <p
            className={`sender-name mb-0.5 text-[13px] font-semibold ${isMedia ? "px-2 pt-1" : ""}`}
            style={{ "--h": hueFromId(message.senderId) } as CSSProperties}
          >
            <span className="inline-flex items-center gap-1.5 align-middle">
              <Avatar
                id={message.senderId}
                name={senderName}
                avatarUrl={message.sender?.avatarUrl ?? null}
                size={20}
                openStatusOnClick
              />
              {senderName}
            </span>
          </p>
        ) : null}

        {message.forwarded && !isDeleted ? (
          <p className={`mb-0.5 flex items-center gap-1 text-xs italic ${metaTone} ${isMedia ? "px-2 pt-1" : ""}`}>
            <Forward size={13} aria-hidden="true" />
            Transféré
          </p>
        ) : null}

        {message.statusQuote && !isDeleted ? (
          <div
            className={`mb-1 rounded-lg border-l-4 px-2.5 py-1.5 text-[13px] ${
              mine ? "border-bubble-out-ink/50 bg-black/10" : "border-brand bg-black/5 dark:bg-white/10"
            }`}
          >
            <p className={`flex items-center gap-1 text-xs font-semibold ${mine ? "text-bubble-out-ink/80" : "text-brand"}`}>
              <CircleDashed size={12} aria-hidden="true" />
              Statut
            </p>
            <p className="line-clamp-3 whitespace-pre-wrap break-words">{message.statusQuote}</p>
          </div>
        ) : null}

        {message.replyTo && !isDeleted ? (
          <div className={isMedia ? "px-1 pt-1" : ""}>
            <QuotedBlock
              quoted={message.replyTo}
              meId={meId}
              variant={mine ? "bubble-mine" : "bubble-other"}
              onClick={onReplyClick ? () => onReplyClick(message.replyTo!.id) : undefined}
            />
          </div>
        ) : null}

        {/* Message supprimé pour tout le monde */}
        {isDeleted ? (
          <>
            <span className={`inline-flex items-center gap-1.5 italic ${metaTone}`}>
              <Ban size={15} aria-hidden="true" />
              {mine ? "Tu as supprimé ce message" : "Ce message a été supprimé"}
            </span>
            <span className={`float-right ml-3 mt-2 inline-flex items-center gap-1 text-[11px] leading-none ${metaTone}`}>
              <time dateTime={message.createdAt} suppressHydrationWarning>
                {formatTime(message.createdAt)}
              </time>
            </span>
          </>
        ) : null}

        {/* Photo */}
        {message.type === "IMAGE" && media ? (
          <div className="relative">
            {media.src && holdImage ? (
              <button
                type="button"
                onClick={() => setLoadAnyway(true)}
                aria-label={`Charger la photo ${media.fileName} (${formatBytes(media.size)})`}
                className="flex h-40 w-[15rem] max-w-full flex-col items-center justify-center gap-1 bg-black/10 text-center"
                style={{
                  borderRadius: radius - 4,
                  ...(media.width && media.height ? { aspectRatio: `${media.width} / ${media.height}`, height: "auto", minHeight: "8rem" } : {}),
                }}
              >
                <span className="font-semibold">Toucher pour charger</span>
                <span className="text-xs opacity-70">Photo · {formatBytes(media.size)}</span>
              </button>
            ) : media.src ? (
              <button
                type="button"
                onClick={() => setViewing(true)}
                disabled={media.uploading}
                aria-label={`Agrandir la photo ${media.fileName}`}
                className="block overflow-hidden"
                style={{ borderRadius: radius - 4 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={media.src}
                  alt={media.fileName}
                  loading="lazy"
                  decoding="async"
                  width={media.width ?? undefined}
                  height={media.height ?? undefined}
                  className="block h-auto max-h-[22rem] w-full max-w-[17rem] bg-black/5 object-cover"
                  style={media.width && media.height ? { aspectRatio: `${media.width} / ${media.height}` } : undefined}
                />
              </button>
            ) : null}
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] leading-none text-white">
              {meta}
            </span>
          </div>
        ) : null}

        {purged ? (
          <p className={`flex items-center gap-2 py-1 text-[14px] italic ${mine ? "text-bubble-out-ink/80" : "text-muted"}`}>
            <Ban size={16} aria-hidden="true" className="shrink-0" />
            Fichier supprimé pour libérer de l&apos;espace
          </p>
        ) : null}

        {/* Sondage */}
        {message.type === "POLL" && message.poll && !isDeleted ? (
          <>
            <PollBlock message={message} meId={meId} mine={mine} onVote={onVote} />
            <p className={`flex items-center justify-end gap-1 text-[11px] leading-none ${metaTone}`}>{meta}</p>
          </>
        ) : null}

        {/* Vidéo */}
        {message.type === "VIDEO" && media ? (
          <div className="relative">
            {media.src ? (
              <video
                src={media.src}
                controls
                playsInline
                preload={dataSaver.active ? "none" : "metadata"}
                className="block max-h-[22rem] w-full max-w-[17rem] bg-black object-contain"
                style={{ borderRadius: radius - 4 }}
              />
            ) : null}
            <p className={`px-2 pb-1 pt-1.5 text-[11px] leading-none ${metaTone} flex items-center justify-end gap-1`}>
              {meta}
            </p>
          </div>
        ) : null}

        {/* Message vocal */}
        {message.type === "AUDIO" && media ? (
          <>
            <VoicePlayer
              src={media.src}
              durationMs={media.durationMs ?? 0}
              mine={mine}
              label={media.uploading ? `Envoi… ${progress} %` : undefined}
            />
            <p className={`flex items-center justify-end gap-1 text-[11px] leading-none ${metaTone}`}>{meta}</p>
          </>
        ) : null}

        {/* Document */}
        {message.type === "FILE" && media ? (
          <>
            <div className="flex w-60 items-center gap-3 py-1 sm:w-64">
              <span
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  mine ? "bg-white/15" : "bg-bg"
                }`}
              >
                <FileText size={22} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{media.fileName}</span>
                <span className={`block text-xs ${metaTone}`}>
                  {media.uploading ? `Envoi… ${progress} %` : formatBytes(media.size)}
                </span>
              </span>
              {message.attachment ? (
                <a
                  href={media.src ?? undefined}
                  download={media.fileName}
                  aria-label={`Télécharger ${media.fileName}`}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    mine ? "bg-white/15 hover:bg-white/25" : "bg-bg hover:bg-line"
                  }`}
                >
                  <Download size={18} />
                </a>
              ) : null}
            </div>
            <p className={`flex items-center justify-end gap-1 text-[11px] leading-none ${metaTone}`}>{meta}</p>
          </>
        ) : null}

        {/* Texte */}
        {message.type === "TEXT" && !isDeleted ? (
          <>
            {message.linkPreview && !dataSaver.active ? <LinkCard preview={message.linkPreview} mine={mine} /> : null}
            <span
              className={
                isEmojiOnly(message.content)
                  ? "block whitespace-pre-wrap break-words text-[2.6rem] leading-tight"
                  : "whitespace-pre-wrap break-words"
              }
            >
              <Linkify text={message.content ?? ""} mentionable={mentionable} meUsername={meUsername} />
            </span>
            <span className={`float-right ml-3 mt-2 inline-flex items-center gap-1 text-[11px] leading-none ${metaTone}`}>
              {meta}
            </span>
          </>
        ) : null}

        {/* Barre de progression d'un envoi en cours */}
        {message.upload && message.localStatus === "pending" ? (
          <div
            role="progressbar"
            aria-label="Envoi du fichier"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-1 h-1 overflow-hidden rounded-full bg-black/15"
          >
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </div>

      {reactionGroups.size > 0 ? (
        <div className={`-mt-1.5 flex flex-wrap gap-1 px-2 ${mine ? "justify-end" : "justify-start"}`}>
          {Array.from(reactionGroups, ([emoji, info]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact?.(emoji)}
              aria-pressed={info.mine}
              aria-label={`${emoji} ${info.count}${info.mine ? ", ta réaction (toucher pour retirer)" : ""}`}
              className={`inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs shadow-sm ${
                info.mine ? "border-accent bg-accent/25" : "border-line bg-panel"
              }`}
            >
              <span aria-hidden="true">{emoji}</span>
              {info.count > 1 ? <span className="font-medium">{info.count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {status === "failed" ? (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-medium text-danger">
          <span role="alert">{message.localError ?? "Le message n'est pas parti."}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="underline">
              Renvoyer
            </button>
          ) : null}
          {onDiscard ? (
            <button type="button" onClick={onDiscard} className="underline">
              Supprimer
            </button>
          ) : null}
        </div>
      ) : null}

      {viewing && media?.src ? (
        <ImageViewer src={media.src} fileName={media.fileName} onClose={() => setViewing(false)} />
      ) : null}
    </div>
  );
}
