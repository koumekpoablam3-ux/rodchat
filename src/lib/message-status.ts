import type { ChatMessage } from "@/types/chat";

export type MessageStatus = "pending" | "failed" | "sent" | "delivered" | "read";

/** État d'un message que j'ai envoyé, déduit des accusés de chaque destinataire */
export function messageStatus(message: ChatMessage): MessageStatus {
  if (message.localStatus) return message.localStatus;
  const { receipts } = message;
  if (receipts.length > 0 && receipts.every((r) => r.readAt)) return "read";
  if (receipts.length > 0 && receipts.every((r) => r.deliveredAt)) return "delivered";
  return "sent";
}
