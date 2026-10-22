"use client";

import { memo } from "react";
import type { MessageStatus } from "@/lib/message-status";
import type { ChatMessage } from "@/types/chat";
import MessageBubble from "./MessageBubble";

/**
 * Actions d'une bulle. Cet objet est STABLE (même référence à chaque rendu de la discussion) : il appelle toujours la
 * dernière version des fonctions, ce qui permet de ne refaire que les bulles dont les données ont changé.
 */
export type BubbleActions = {
  retry: (clientId: string) => void;
  discard: (clientId: string) => void;
  openMenu: (messageId: string) => void;
  toggleSelect: (messageId: string) => void;
  goTo: (messageId: string) => void;
  vote: (messageId: string, optionIds: string[]) => Promise<string | null>;
  swipeReply: (messageId: string) => void;
  react: (messageId: string, emoji: string) => void;
};

type BubbleRowProps = {
  message: ChatMessage;
  meId: string;
  meUsername: string;
  mentionable?: Set<string>;
  mine: boolean;
  showSender: boolean;
  senderName: string;
  tail: boolean;
  status: MessageStatus;
  starred: boolean;
  highlighted: boolean;
  selecting: boolean;
  selected: boolean;
  /** Glisser pour répondre autorisé (ni sélection en cours, ni contact bloqué) */
  canReply: boolean;
  actions: BubbleActions;
};

/**
 * Une bulle de message, mémoïsée : un changement sans rapport (quelqu'un qui écrit, la présence, un message plus loin)
 * ne refait plus les centaines de bulles d'une longue discussion, seulement celle qui a changé.
 * Tout ce qui est passé ici doit être une valeur simple ou une référence stable.
 */
function BubbleRowBase({
  message,
  meId,
  meUsername,
  mentionable,
  mine,
  showSender,
  senderName,
  tail,
  status,
  starred,
  highlighted,
  selecting,
  selected,
  canReply,
  actions,
}: BubbleRowProps) {
  const clientId = message.clientId;
  return (
    <MessageBubble
      message={message}
      meId={meId}
      mentionable={mentionable}
      meUsername={meUsername}
      mine={mine}
      showSender={showSender}
      senderName={senderName}
      tail={tail}
      status={status}
      starred={starred}
      highlighted={highlighted}
      onRetry={clientId ? () => actions.retry(clientId) : undefined}
      onDiscard={clientId ? () => actions.discard(clientId) : undefined}
      onOpenMenu={selecting ? undefined : () => actions.openMenu(message.id)}
      selectionMode={selecting}
      selected={selected}
      onToggleSelect={() => actions.toggleSelect(message.id)}
      onReplyClick={actions.goTo}
      onVote={(optionIds) => actions.vote(message.id, optionIds)}
      onSwipeReply={canReply ? () => actions.swipeReply(message.id) : undefined}
      onReact={(emoji) => actions.react(message.id, emoji)}
    />
  );
}

const BubbleRow = memo(BubbleRowBase);
export default BubbleRow;
