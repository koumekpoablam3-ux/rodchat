"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import Avatar from "@/components/chat/Avatar";
import { useChat } from "@/components/chat/ChatProvider";
import { getDraft, saveDraft } from "@/lib/drafts";

/** Ce qu'une autre application a partagé (titre, texte, lien) en un seul texte */
function readShared() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title")?.trim() ?? "";
  const text = params.get("text")?.trim() ?? "";
  const url = params.get("url")?.trim() ?? "";
  const parts: string[] = [];
  if (text) parts.push(text);
  else if (title) parts.push(title);
  if (url && !parts.some((part) => part.includes(url))) parts.push(url);
  return parts.join("\n").slice(0, 4000);
}

/**
 * Cible de partage de l'application installée : on choisit la discussion, le texte y est déposé en brouillon
 * (à relire et envoyer), comme si on l'avait écrit.
 */
export default function SharePage() {
  const router = useRouter();
  const { conversations } = useChat();
  const [shared, setShared] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setShared(readShared());
  }, []);

  const list = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return conversations.filter((c) => !c.archivedAt && (!query || c.name.toLowerCase().includes(query)));
  }, [conversations, filter]);

  function pick(conversationId: string) {
    if (!shared) return;
    const existing = getDraft(conversationId);
    saveDraft(conversationId, existing ? `${existing}\n${shared}` : shared);
    router.push(`/chat/${conversationId}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-3 py-3">
        <Link href="/chat" aria-label="Retour" className="rounded-full p-2 text-muted">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-semibold">Partager avec…</h1>
      </header>

      {shared === null ? null : shared ? (
        <>
          <p className="m-3 line-clamp-4 whitespace-pre-wrap break-words rounded-2xl bg-bg p-3 text-sm text-muted">{shared}</p>
          <label className="relative mx-3 mb-2 block">
            <span className="sr-only">Chercher une discussion</span>
            <Search size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Chercher une discussion"
              className="h-11 w-full rounded-xl border border-line bg-bg pl-10 pr-3 text-sm placeholder:text-muted"
            />
          </label>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {list.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => pick(conversation.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg/60 focus-visible:bg-bg/60"
                >
                  <Avatar
                    id={conversation.otherUserId ?? conversation.id}
                    name={conversation.name}
                    avatarUrl={conversation.avatarUrl}
                    isGroup={conversation.isGroup}
                  />
                  <span className="min-w-0 flex-1 truncate font-display font-semibold">{conversation.name}</span>
                </button>
              </li>
            ))}
            {list.length === 0 ? <li className="p-6 text-center text-sm text-muted">Aucune discussion trouvée.</li> : null}
          </ul>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-muted">Il n&apos;y a rien à partager.</p>
          <Link href="/chat" className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-ink">
            Retour aux discussions
          </Link>
        </div>
      )}
    </div>
  );
}
