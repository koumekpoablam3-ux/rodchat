"use client";

import { usePathname } from "next/navigation";
import CallProvider from "@/components/call/CallProvider";
import StatusProvider from "@/components/status/StatusProvider";
import AnnouncementBanner from "./AnnouncementBanner";
import AppBadge from "./AppBadge";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import KeyboardShortcuts from "./KeyboardShortcuts";
import NewChatDialog from "./NewChatDialog";
import NotificationPrompt from "./NotificationPrompt";
import Sidebar from "./Sidebar";

// Sur ordinateur : liste + discussion côte à côte.
// Sur téléphone : une seule des deux à la fois, selon l'adresse.
export default function ChatShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoot = pathname === "/chat";
  useVisualViewportHeight();

  return (
    <CallProvider>
      <StatusProvider>
      <div className="flex h-dvh overflow-hidden bg-bg" style={{ height: "var(--app-height, 100dvh)" }}>
        <Sidebar visibleOnMobile={isRoot} />
        <main className={`${isRoot ? "hidden" : "flex"} min-w-0 flex-1 flex-col md:flex`}>{children}</main>
        <NewChatDialog />
        <AnnouncementBanner />
        <NotificationPrompt />
        <AppBadge />
        <KeyboardShortcuts />
      </div>
      </StatusProvider>
    </CallProvider>
  );
}
