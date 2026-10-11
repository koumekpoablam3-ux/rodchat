import type { CSSProperties } from "react";
import { Ban, FileText, Image as ImageIcon, Mic, Video } from "lucide-react";
import { describeMessage } from "@/lib/message-text";
import { hueFromId } from "@/lib/utils";
import type { QuotedMessage } from "@/types/chat";

type QuotedBlockProps = {
  quoted: QuotedMessage;
  meId: string;
  /** Dans une bulle (cliquable, fond teinté) ou au-dessus du champ de saisie */
  variant: "bubble-mine" | "bubble-other" | "composer";
  onClick?: () => void;
  onClose?: () => void;
};

function TypeIcon({ type }: { type: QuotedMessage["type"] }) {
  const props = { size: 14, "aria-hidden": true as const, className: "shrink-0" };
  if (type === "IMAGE") return <ImageIcon {...props} />;
  if (type === "VIDEO") return <Video {...props} />;
  if (type === "AUDIO") return <Mic {...props} />;
  if (type === "FILE") return <FileText {...props} />;
  return null;
}

/** Citation d'un message auquel on répond */
export default function QuotedBlock({ quoted, meId, variant, onClick }: QuotedBlockProps) {
  const name = quoted.senderId === meId ? "Toi" : quoted.sender.displayName || "Quelqu'un";
  const deleted = quoted.deletedAt !== null;
  const text = deleted ? "Message supprimé" : describeMessage(quoted.type, quoted.content, quoted.attachment?.fileName);

  const surface =
    variant === "bubble-mine" ? "bg-white/12" : variant === "bubble-other" ? "bg-black/5 dark:bg-white/8" : "bg-bg";
  const body = (
    <>
      <span
        className="sender-name block truncate text-[13px] font-semibold"
        style={{ "--h": hueFromId(quoted.senderId) } as CSSProperties}
      >
        {name}
      </span>
      <span className="flex items-center gap-1 text-[13px] opacity-80">
        {deleted ? <Ban size={13} aria-hidden="true" className="shrink-0" /> : <TypeIcon type={quoted.type} />}
        <span className={`truncate ${deleted ? "italic" : ""}`}>{text}</span>
      </span>
    </>
  );

  const className = `block w-full min-w-0 rounded-lg border-l-4 px-2.5 py-1.5 text-left ${surface}`;
  const style = { borderLeftColor: `hsl(${hueFromId(quoted.senderId)} 55% 50%)` };

  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} mb-1`} style={style} aria-label={`Aller au message de ${name}`}>
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
