import ChatView from "@/components/chat/ChatView";

export default function ConversationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { m?: string | string[] };
}) {
  // ?m=<id> : on arrive depuis une recherche et on ouvre la discussion sur ce message
  const focus = Array.isArray(searchParams.m) ? searchParams.m[0] : searchParams.m;

  // La clé remet à zéro l'état local (saisie, défilement) à chaque changement de discussion
  return <ChatView key={params.id} conversationId={params.id} focusMessageId={focus} />;
}
