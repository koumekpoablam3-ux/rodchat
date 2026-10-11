import type { ChatMessage } from "@/types/chat";

/** Information au milieu de la discussion : « Léa a ajouté Marc », « messages éphémères activés »… */
export default function SystemRow({ message }: { message: ChatMessage }) {
  return (
    <div className="my-2 flex justify-center px-6">
      <p className="max-w-md rounded-2xl bg-panel/95 px-3.5 py-1.5 text-center text-xs font-medium text-muted shadow-sm">
        {message.content}
      </p>
    </div>
  );
}
