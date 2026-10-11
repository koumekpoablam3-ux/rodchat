"use client";

import { usePathname } from "next/navigation";
import CallProvider from "@/components/call/CallProvider";
import NewChatDialog from "./NewChatDialog";
import Sidebar from "./Sidebar";

// Sur ordinateur : liste + discussion côte à côte.
// Sur téléphone : une seule des deux à la fois, selon l'adresse.
export default function ChatShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoot = pathname === "/chat";

  return (
    <CallProvider>
      <div className="flex h-dvh overflow-hidden bg-bg">
        <Sidebar visibleOnMobile={isRoot} />
        <main className={`${isRoot ? "hidden" : "flex"} min-w-0 flex-1 flex-col md:flex`}>{children}</main>
        <NewChatDialog />
      </div>
    </CallProvider>
  );
}
