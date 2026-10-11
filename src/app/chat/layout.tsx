import { redirect } from "next/navigation";
import ChatProvider from "@/components/chat/ChatProvider";
import ChatShell from "@/components/chat/ChatShell";
import { listConversations } from "@/lib/conversations";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const conversations = await listConversations(user.id);

  return (
    <ChatProvider me={user} initialConversations={conversations}>
      <ChatShell>{children}</ChatShell>
    </ChatProvider>
  );
}
