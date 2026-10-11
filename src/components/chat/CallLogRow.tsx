import { Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Video } from "lucide-react";
import { formatDuration, formatTime } from "@/lib/format";
import type { ChatMessage } from "@/types/chat";

/** Ligne du journal d'appels, affichée au milieu de la discussion */
export default function CallLogRow({ message, meId }: { message: ChatMessage; meId: string }) {
  const call = message.call;
  if (!call) return null;

  const outgoing = message.senderId === meId;
  const group = call.calleeId === null;
  const label = `${call.kind === "VIDEO" ? "vidéo" : "audio"}${group ? " de groupe" : ""}`;

  let text: string;
  let Icon = call.kind === "VIDEO" ? Video : Phone;
  let tone = "text-muted";

  if (call.status === "MISSED") {
    text = outgoing ? `Appel ${label} sans réponse` : `Appel ${label} manqué`;
    Icon = outgoing ? PhoneOff : PhoneMissed;
    if (!outgoing) tone = "text-danger";
  } else if (call.status === "DECLINED") {
    text = outgoing ? `Appel ${label} refusé` : `Appel ${label} refusé par toi`;
    Icon = PhoneOff;
  } else if (call.durationSec !== null && call.durationSec > 0) {
    text = `Appel ${label}, ${formatDuration(call.durationSec * 1000)}`;
    Icon = outgoing ? PhoneOutgoing : PhoneIncoming;
  } else {
    text = `Appel ${label}`;
  }

  return (
    <div className="my-2 flex justify-center">
      <span
        className={`inline-flex items-center gap-2 rounded-full bg-panel/95 px-3.5 py-1.5 text-xs font-medium shadow-sm ${tone}`}
      >
        <Icon size={14} aria-hidden="true" />
        {text}
        <time dateTime={message.createdAt} suppressHydrationWarning className="text-muted">
          {formatTime(message.createdAt)}
        </time>
      </span>
    </div>
  );
}
