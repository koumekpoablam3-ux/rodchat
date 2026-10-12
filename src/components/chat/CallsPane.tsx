"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Video } from "lucide-react";
import { useCall } from "@/components/call/CallProvider";
import { formatDuration, formatListDate } from "@/lib/format";
import { getSocket } from "@/lib/socket";
import type { CallRecord } from "@/app/api/calls/route";
import Avatar from "./Avatar";
import { useChat } from "./ChatProvider";

/** Historique des appels (volet « Appels » de la barre de navigation) : un toucher rappelle la personne */
export default function CallsPane() {
  const router = useRouter();
  const { me, conversations, onlineIds } = useChat();
  const { startCall, startGroupCall, joinGroupCall, ongoingGroupCalls, inCall } = useCall();
  const [calls, setCalls] = useState<CallRecord[] | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/calls", { cache: "no-store" });
      if (response.ok) setCalls(((await response.json()) as { calls: CallRecord[] }).calls);
      else setCalls((previous) => previous ?? []);
    } catch {
      setCalls((previous) => previous ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    const socket = getSocket();
    const reload = () => void load();
    socket.on("call:ended", reload);
    socket.on("groupcall:ended", reload);
    socket.on("connect", reload);
    return () => {
      socket.off("call:ended", reload);
      socket.off("groupcall:ended", reload);
      socket.off("connect", reload);
    };
  }, [load]);

  if (calls === null) return <p className="px-6 py-10 text-center text-sm text-muted">Chargement…</p>;

  const rows = calls.flatMap((call) => {
    const conversation = conversations.find((c) => c.id === call.conversationId);
    return conversation ? [{ call, conversation }] : [];
  });

  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-display text-lg font-semibold">Aucun appel pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted">
          Ouvre une discussion et touche l&apos;icône du téléphone ou de la caméra pour appeler.
        </p>
      </div>
    );
  }

  function callBack(record: CallRecord) {
    if (inCall) return;
    if (record.calleeId !== null) return void startCall(record.conversationId, record.kind);
    // Appel de groupe : on rejoint s'il est en cours, sinon on en lance un nouveau
    if (ongoingGroupCalls[record.conversationId]) return void joinGroupCall(record.conversationId);
    void startGroupCall(record.conversationId, record.kind);
  }

  return (
    <ul className="scroll-thin flex-1 overflow-y-auto" aria-label="Historique des appels">
      {rows.map(({ call, conversation }) => {
        const outgoing = call.callerId === me.id;
        const group = call.calleeId === null;
        let Icon = outgoing ? PhoneOutgoing : PhoneIncoming;
        let label = outgoing ? "Sortant" : "Entrant";
        let tone = "text-muted";

        if (call.status === "MISSED") {
          Icon = outgoing ? PhoneOff : PhoneMissed;
          label = outgoing ? "Sans réponse" : "Manqué";
          if (!outgoing) tone = "text-danger";
        } else if (call.status === "DECLINED") {
          Icon = PhoneOff;
          label = outgoing ? "Refusé" : "Refusé par toi";
        } else if (call.durationSec) {
          label += ` · ${formatDuration(call.durationSec * 1000)}`;
        }

        const KindIcon = call.kind === "VIDEO" ? Video : Phone;
        return (
          <li key={call.id} className="flex items-center gap-1 pr-3 hover:bg-bg/60">
            <button
              type="button"
              onClick={() => router.push(`/chat/${call.conversationId}`)}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left focus-visible:bg-bg/60"
            >
              <Avatar
                id={conversation.otherUserId ?? conversation.id}
                name={conversation.name}
                avatarUrl={conversation.avatarUrl}
                isGroup={conversation.isGroup}
                online={!conversation.isGroup && conversation.otherUserId !== null && onlineIds.has(conversation.otherUserId)}
              />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-display font-semibold ${tone === "text-danger" ? "text-danger" : ""}`}>
                  {conversation.name}
                </span>
                <span className={`flex items-center gap-1.5 truncate text-sm ${tone}`}>
                  <Icon size={14} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">
                    {group ? "Groupe · " : ""}
                    {label} · {formatListDate(call.startedAt)}
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={inCall}
              onClick={() => callBack(call)}
              aria-label={`${call.kind === "VIDEO" ? "Appel vidéo" : "Appel audio"} avec ${conversation.name}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand hover:bg-bg disabled:opacity-40"
            >
              <KindIcon size={20} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
