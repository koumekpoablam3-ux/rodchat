export type CallRecord = {
  id: string;
  conversationId: string;
  kind: "AUDIO" | "VIDEO";
  status: "ENDED" | "MISSED" | "DECLINED";
  startedAt: string;
  durationSec: number | null;
  callerId: string;
  /** null = appel de groupe */
  calleeId: string | null;
};
