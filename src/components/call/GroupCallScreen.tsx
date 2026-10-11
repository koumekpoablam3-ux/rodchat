"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import Avatar from "@/components/chat/Avatar";
import type { ActiveGroupCall, GroupPeer } from "@/hooks/useGroupCall";
import { formatDuration } from "@/lib/format";

type GroupCallScreenProps = {
  call: ActiveGroupCall;
  connected: boolean;
  meName: string;
  onAccept: () => void;
  onDecline: () => void;
  onLeave: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
};

const roundButton =
  "inline-flex h-14 w-14 items-center justify-center rounded-full text-white focus-visible:outline-white";

/** Une personne de l'appel : sa vidéo, ou son avatar. Le son passe toujours par l'élément vidéo. */
function Tile({
  id,
  name,
  avatarUrl,
  stream,
  local,
  videoCall,
  camOn,
  waiting,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  stream: MediaStream | null;
  local?: boolean;
  videoCall: boolean;
  camOn?: boolean;
  waiting?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const hasVideo = videoCall && !!stream && stream.getVideoTracks().length > 0 && (local ? camOn !== false : true);

  return (
    <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-white/8">
      {/* Toujours présent : c'est lui qui joue le son des autres, même sans image */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={local}
        className={`absolute inset-0 h-full w-full object-cover ${local ? "-scale-x-100" : ""} ${hasVideo ? "" : "opacity-0"}`}
      />
      {!hasVideo ? (
        <div className="relative flex flex-col items-center gap-2 p-2">
          <Avatar id={id} name={name} avatarUrl={avatarUrl} size={72} />
          {waiting ? <span className="text-xs text-white/70">Connexion…</span> : null}
        </div>
      ) : null}
      <span className="absolute bottom-2 left-2 max-w-[85%] truncate rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium">
        {local ? `Toi (${name})` : name}
      </span>
    </div>
  );
}

function gridClass(count: number) {
  if (count <= 1) return "grid-cols-1";
  if (count <= 4) return "grid-cols-2";
  return "grid-cols-2 md:grid-cols-3";
}

export default function GroupCallScreen({
  call,
  connected,
  meName,
  onAccept,
  onDecline,
  onLeave,
  onToggleMic,
  onToggleCam,
}: GroupCallScreenProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const ringing = call.phase === "ringing";
  const video = call.kind === "VIDEO";

  useEffect(() => {
    primaryRef.current?.focus();
  }, [ringing]);

  useEffect(() => {
    if (call.startedAt === null) return;
    const startedAt = call.startedAt;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call.startedAt]);

  const subtitle = !connected
    ? "Reconnexion…"
    : ringing
      ? `Appel ${video ? "vidéo" : "audio"} de groupe`
      : call.startedAt !== null
        ? formatDuration(elapsedMs)
        : call.peers.length === 0
          ? "En attente des autres participants…"
          : "Connexion…";

  const tiles = call.peers.length + 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ringing ? `Appel de groupe entrant dans ${call.groupName}` : `Appel de groupe ${call.groupName}`}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#100D18] text-white"
    >
      <div className="px-6 pt-[calc(env(safe-area-inset-top)+1rem)] text-center">
        <p className="truncate font-display text-xl font-semibold">{call.groupName}</p>
        <p className="mt-0.5 text-sm text-white/75" role="status" aria-live="polite">
          {subtitle}
        </p>
      </div>

      {ringing ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {call.from ? <Avatar id={call.from.id} name={call.from.name} avatarUrl={call.from.avatarUrl} size={112} /> : null}
          <p className="font-display text-2xl font-bold">{call.from?.name ?? "Quelqu'un"}</p>
          <p className="text-white/75">t&apos;invite à un appel dans « {call.groupName} »</p>
        </div>
      ) : (
        <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 p-3 ${gridClass(tiles)}`}>
          <Tile
            id="me"
            name={meName}
            avatarUrl={null}
            stream={call.localStream}
            local
            videoCall={video}
            camOn={call.camOn}
          />
          {call.peers.map((peer: GroupPeer) => (
            <Tile
              key={peer.id}
              id={peer.id}
              name={peer.name}
              avatarUrl={peer.avatarUrl}
              stream={peer.stream}
              videoCall={video}
              waiting={!peer.connected}
            />
          ))}
        </div>
      )}

      <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4">
        {ringing ? (
          <div className="mx-auto flex max-w-xs items-start justify-around">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onDecline}
                aria-label="Refuser l'appel"
                className={`${roundButton} h-16 w-16 bg-red-600 hover:bg-red-500`}
              >
                <PhoneOff size={26} />
              </button>
              <span className="text-sm text-white/80">Refuser</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                ref={primaryRef}
                type="button"
                onClick={onAccept}
                aria-label="Rejoindre l'appel"
                className={`${roundButton} h-16 w-16 bg-emerald-600 hover:bg-emerald-500`}
              >
                {video ? <Video size={26} /> : <Phone size={26} />}
              </button>
              <span className="text-sm text-white/80">Rejoindre</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-xs items-center justify-center gap-5">
            <button
              type="button"
              onClick={onToggleMic}
              aria-pressed={!call.micOn}
              aria-label={call.micOn ? "Couper le micro" : "Réactiver le micro"}
              className={`${roundButton} ${call.micOn ? "bg-white/15 hover:bg-white/25" : "bg-white text-[#100D18] hover:bg-white/90"}`}
            >
              {call.micOn ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            {video ? (
              <button
                type="button"
                onClick={onToggleCam}
                aria-pressed={!call.camOn}
                aria-label={call.camOn ? "Couper la caméra" : "Réactiver la caméra"}
                className={`${roundButton} ${call.camOn ? "bg-white/15 hover:bg-white/25" : "bg-white text-[#100D18] hover:bg-white/90"}`}
              >
                {call.camOn ? <Video size={24} /> : <VideoOff size={24} />}
              </button>
            ) : null}
            <button
              ref={primaryRef}
              type="button"
              onClick={onLeave}
              aria-label="Quitter l'appel"
              className={`${roundButton} bg-red-600 hover:bg-red-500`}
            >
              <PhoneOff size={24} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
