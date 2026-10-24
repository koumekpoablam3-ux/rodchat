"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Download, EllipsisVertical, LogOut, Settings, Share2, ShieldCheck, Star, UserRound } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { unbindPushSubscription, usePush } from "@/hooks/usePush";
import { shareInvite } from "@/lib/share-invite";
import { getSocket } from "@/lib/socket";
import Avatar from "./Avatar";
import { useChat } from "./ChatProvider";
import ProfileDialog from "./ProfileDialog";
import SettingsDialog from "./SettingsDialog";
import { removeLock } from "@/lib/app-lock";
import StarredDialog from "./StarredDialog";

const itemClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-bg focus-visible:bg-bg";

export default function AppMenu() {
  const router = useRouter();
  const { me } = useChat();
  const { canInstall, iosHint, install } = useInstallPrompt();
  const push = usePush();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPending, setAdminPending] = useState(0);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Le lien « Espace admin » n'apparaît que pour les administrateurs
  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ admin?: boolean; pending?: number }>)
      .then((data) => {
        setIsAdmin(data.admin === true);
        setAdminPending(data.pending ?? 0);
      })
      .catch(() => {});
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout() {
    removeLock(); // le code de verrouillage n'a plus de sens une fois déconnecté
    setOpen(false);
    getSocket().disconnect();
    await unbindPushSubscription(); // avant la déconnexion : il faut encore être identifié pour retirer l'abonnement
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-bg"
      >
        <EllipsisVertical size={20} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Menu de l'application"
          className="rise absolute right-0 top-12 z-40 w-72 rounded-2xl border border-line bg-panel p-2 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-xl px-3 pb-2 pt-1.5 text-left hover:bg-bg focus-visible:bg-bg"
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
          >
            <Avatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display font-semibold">{me.displayName}</span>
              <span className="block truncate text-sm text-muted">@{me.username}</span>
            </span>
            <UserRound size={18} aria-label="Modifier mon profil" className="shrink-0 text-muted" />
          </button>
          <div className="my-1 border-t border-line" />

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              setStarredOpen(true);
            }}
          >
            <Star size={18} aria-hidden="true" />
            Messages favoris
          </button>
          {isAdmin ? (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                setOpen(false);
                router.push("/admin");
              }}
            >
              <ShieldCheck size={18} aria-hidden="true" />
              Espace admin
              {adminPending > 0 ? (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold leading-5 text-accent-ink">
                  {adminPending}
                </span>
              ) : null}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
          >
            <Settings size={18} aria-hidden="true" />
            Paramètres
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              const nativeShare = typeof navigator.share === "function";
              if (nativeShare) setOpen(false);
              void shareInvite().then((result) => {
                if (result === "copied") {
                  setInviteCopied(true);
                  setTimeout(() => {
                    setInviteCopied(false);
                    setOpen(false);
                  }, 1400);
                } else if (!nativeShare) {
                  setOpen(false);
                }
              });
            }}
          >
            <Share2 size={18} aria-hidden="true" />
            {inviteCopied ? "Lien copié ✓" : "Inviter des amis"}
          </button>
          <div className="my-1 border-t border-line" />

          {canInstall ? (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                setOpen(false);
                void install();
              }}
            >
              <Download size={18} aria-hidden="true" />
              Installer l&apos;application
            </button>
          ) : null}

          {iosHint ? (
            <p className="px-3 py-2 text-sm text-muted">
              Pour installer Rodchat sur iPhone : touche Partager, puis « Sur l&apos;écran d&apos;accueil ».
            </p>
          ) : null}

          {push.state === "off" ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => void push.enable()}>
              <Bell size={18} aria-hidden="true" />
              Activer les notifications
            </button>
          ) : null}
          {push.state === "on" ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => void push.disable()}>
              <BellOff size={18} aria-hidden="true" />
              Désactiver les notifications
            </button>
          ) : null}
          {push.state === "denied" ? (
            <p className="px-3 py-2 text-sm text-muted">
              Les notifications sont bloquées. Autorise-les dans les réglages de ton navigateur.
            </p>
          ) : null}

          <button type="button" role="menuitem" className={itemClass} onClick={() => void logout()}>
            <LogOut size={18} aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      ) : null}
      {profileOpen ? <ProfileDialog onClose={() => setProfileOpen(false)} /> : null}
      {starredOpen ? <StarredDialog onClose={() => setStarredOpen(false)} /> : null}
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
