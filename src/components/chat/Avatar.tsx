import { Users } from "lucide-react";
import { hueFromId } from "@/lib/utils";

type AvatarProps = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
  size?: number;
  online?: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export default function Avatar({ id, name, avatarUrl, isGroup, size = 48, online }: AvatarProps) {
  const style = {
    width: size,
    height: size,
    backgroundColor: `hsl(${hueFromId(id)} 42% 36%)`,
    fontSize: Math.round(size * 0.38),
  };

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="rounded-full object-cover" style={style} />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center rounded-full font-display font-semibold text-white"
          style={style}
        >
          {isGroup ? <Users size={Math.round(size * 0.46)} strokeWidth={2} /> : initials(name)}
        </span>
      )}
      {online ? (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-panel"
          title="En ligne"
        >
          <span className="sr-only">En ligne</span>
        </span>
      ) : null}
    </span>
  );
}
