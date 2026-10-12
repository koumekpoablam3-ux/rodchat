"use client";

import { useState, type ReactNode } from "react";
import { CircleDashed, MessageSquare, Phone, Settings, Star } from "lucide-react";
import StatusPanel from "@/components/status/StatusPanel";
import { useStatusFeed } from "@/components/status/useStatusFeed";
import { isMuted } from "@/lib/conversation-sort";
import Avatar from "./Avatar";
import { useChat } from "./ChatProvider";
import ProfileDialog from "./ProfileDialog";
import SettingsDialog from "./SettingsDialog";
import StarredDialog from "./StarredDialog";

export type SidebarTab = "chats" | "calls";

type ItemProps = {
  label: string;
  onClick: () => void;
  active?: boolean;
  /** Pastille avec un nombre */
  badge?: number;
  /** Petit point (quelque chose de nouveau, sans compteur) */
  dot?: boolean;
  /** Visible seulement sur ordinateur (sur téléphone, ces accès sont dans le menu ⋮) */
  desktopOnly?: boolean;
  children: ReactNode;
};

function NavItem({ label, onClick, active, badge, dot, desktopOnly, children }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge ? `${label}, ${badge} non lu${badge > 1 ? "s" : ""}` : label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`relative flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-colors ${
        desktopOnly ? "hidden md:flex" : "flex"
      } h-14 flex-1 md:h-12 md:w-12 md:flex-none ${
        active ? "text-brand md:bg-brand/10" : "text-muted hover:text-ink md:hover:bg-panel"
      }`}
    >
      <span className="relative">
        {children}
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute -right-3 -top-2 min-w-[1.15rem] rounded-full bg-accent px-1 text-center text-[11px] font-bold leading-[1.15rem] text-accent-ink"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
        {dot ? (
          <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-panel" />
        ) : null}
      </span>
      {/* Sur téléphone : l'étiquette sous l'icône ; sur ordinateur : l'icône seule */}
      <span className="md:hidden">{label}</span>
    </button>
  );
}

/**
 * Navigation principale : barre verticale à gauche sur ordinateur, barre d'onglets en bas sur téléphone.
 * Discussions · Appels · Statuts, puis (ordinateur) Favoris · Paramètres · Profil.
 */
export default function NavRail({ tab, onTab }: { tab: SidebarTab; onTab: (tab: SidebarTab) => void }) {
  const { me, conversations } = useChat();
  const { feed, reload, markViewed } = useStatusFeed();
  const [statusOpen, setStatusOpen] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Discussions avec des messages non lus (hors archives et sourdines)
  const unreadChats = conversations.filter(
    (c) => c.archivedAt === null && c.unreadCount > 0 && !isMuted(c.mutedUntil),
  ).length;
  const unseenStatuses = feed?.groups.reduce((total, group) => total + group.unseen, 0) ?? 0;

  return (
    <nav
      aria-label="Navigation principale"
      className="order-2 flex shrink-0 items-stretch border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:order-1 md:w-[4.25rem] md:flex-col md:items-center md:gap-1 md:border-r md:border-t-0 md:bg-bg md:pb-3 md:pt-[calc(env(safe-area-inset-top)+0.75rem)]"
    >
      <NavItem label="Discussions" active={tab === "chats"} badge={unreadChats} onClick={() => onTab("chats")}>
        <MessageSquare size={22} />
      </NavItem>
      <NavItem label="Appels" active={tab === "calls"} onClick={() => onTab("calls")}>
        <Phone size={22} />
      </NavItem>
      <NavItem label="Statuts" dot={unseenStatuses > 0} onClick={() => setStatusOpen(true)}>
        <CircleDashed size={22} />
      </NavItem>

      <div className="hidden md:mt-auto md:flex md:flex-col md:items-center md:gap-1">
        <NavItem label="Messages favoris" desktopOnly onClick={() => setStarredOpen(true)}>
          <Star size={22} />
        </NavItem>
        <NavItem label="Paramètres" desktopOnly onClick={() => setSettingsOpen(true)}>
          <Settings size={22} />
        </NavItem>
        <button
          type="button"
          aria-label={`Mon profil, ${me.displayName}`}
          title="Mon profil"
          onClick={() => setProfileOpen(true)}
          className="mt-1 rounded-full ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-brand/40"
        >
          <Avatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size={36} />
        </button>
      </div>

      {statusOpen ? (
        <StatusPanel feed={feed} reload={reload} markViewed={markViewed} onClose={() => setStatusOpen(false)} />
      ) : null}
      {starredOpen ? <StarredDialog onClose={() => setStarredOpen(false)} /> : null}
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
      {profileOpen ? <ProfileDialog onClose={() => setProfileOpen(false)} /> : null}
    </nav>
  );
}
