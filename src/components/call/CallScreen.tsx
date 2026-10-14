"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import Avatar from "@/components/chat/Avatar";
import { formatDuration } from "@/lib/format";
import type { ActiveCall } from "./CallProvider";

type CallScreenProps = {
  call: ActiveCall;
  connected: boolean;
  meName: string;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
};

function statusText(call: ActiveCall, elapsedMs: number, connected: boolean) {
  if (!connected) return "Reconnexion…";
  if (call.phase === "ringing") return call.kind === "VIDEO" ? "Appel vidéo entrant" : "Appel audio entrant";
  if (call.phase === "calling") return "Appel en cours…";
  if (call.phase === "connecting") return "Connexion…";
  if (call.unstable) return "Connexion instable…";
  return formatDuration(elapsedMs);
}

const roundButton =
  "inline-flex h-14 w-14 items-center justify-center rounded-full text-white focus-visible:outline-white";

export default function CallScreen({
  call,
  connected,
  meName,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMic,
  onToggleCam,
}: CallScreenProps) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const video = call.kind === "VIDEO";
  const ringing = call.phase === "ringing";
  const remoteHasVideo = video && !!call.remoteStream && call.remoteStream.getVideoTracks().length > 0;

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = call.remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = call.remoteStream;
  }, [call.remoteStream, ringing]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = call.localStream;
  }, [call.localStream, ringing]);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [ringing]);

  useEffect(() => {
    if (call.phase !== "active" || call.startedAt === null) return;
    const startedAt = call.startedAt;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call.phase, call.startedAt]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ringing ? `Appel entrant de ${call.peer.name}` : `Appel avec ${call.peer.name}`}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#100D18] text-white"
    >
      {/* Vidéo de l'autre personne en plein écran */}
      {remoteHasVideo ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full bg-black object-cover"
        />
      ) : null}
      {/* Le son de l'autre personne passe toujours par cet élément, même si sa caméra est coupée */}
      {!ringing ? <audio ref={remoteAudioRef} autoPlay /> : null}

      {remoteHasVideo ? <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" /> : null}

      {/* En-tête */}
      <div className="relative z-10 px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] text-center">
        {remoteHasVideo ? (
          <>
            <p className="font-display text-xl font-semibold">{call.peer.name}</p>
            <p className="mt-0.5 text-sm text-white/80" role="status" aria-live="polite">
              {statusText(call, elapsedMs, connected)}
            </p>
          </>
        ) : null}
      </div>

      {/* Au centre : l'avatar tant qu'il n'y a pas d'image de l'autre personne */}
      {!remoteHasVideo ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <Avatar id={call.peer.id} name={call.peer.name} avatarUrl={call.peer.avatarUrl} size={120} noStatusRing />
          <div>
            <p className="font-display text-3xl font-bold">{call.peer.name}</p>
            <p className="mt-1 text-lg text-white/75" role="status" aria-live="polite">
              {statusText(call, elapsedMs, connected)}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Ma caméra en miniature */}
      {video && !ringing && call.localStream ? (
        <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+5rem)] z-20 h-36 w-24 overflow-hidden rounded-2xl bg-black shadow-lg ring-1 ring-white/20 sm:h-44 sm:w-32">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            aria-label={`Ta caméra, ${meName}`}
            className={`h-full w-full -scale-x-100 object-cover ${call.camOn ? "" : "opacity-0"}`}
          />
          {!call.camOn ? (
            <span className="absolute inset-0 flex items-center justify-center text-white/70">
              <VideoOff size={24} aria-label="Caméra coupée" />
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Commandes */}
      <div className="relative z-10 px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-6">
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
                aria-label="Répondre à l'appel"
                className={`${roundButton} h-16 w-16 bg-emerald-600 hover:bg-emerald-500`}
              >
                {video ? <Video size={26} /> : <Phone size={26} />}
              </button>
              <span className="text-sm text-white/80">Répondre</span>
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
              onClick={onHangUp}
              aria-label="Raccrocher"
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
