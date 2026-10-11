"use client";

import { useChat } from "@/components/chat/ChatProvider";

// Écran affiché sur ordinateur quand aucune discussion n'est ouverte
export default function ChatHome() {
  const { setNewChatOpen } = useChat();

  return (
    <div className="wallpaper flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm rounded-3xl bg-panel/95 p-8 text-center shadow-sm">
        <h2 className="font-display text-2xl font-bold">Choisis une discussion</h2>
        <p className="mt-2 text-muted">
          Sélectionne une conversation dans la liste, ou démarre-en une nouvelle.
        </p>
        <button
          type="button"
          onClick={() => setNewChatOpen(true)}
          className="mt-6 h-12 rounded-xl bg-brand px-6 font-semibold text-brand-ink"
        >
          Nouvelle discussion
        </button>
      </div>
    </div>
  );
}
