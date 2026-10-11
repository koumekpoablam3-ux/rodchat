"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/format";

// Un seul vocal à la fois : lancer le suivant met le précédent en pause
let currentAudio: HTMLAudioElement | null = null;

type VoicePlayerProps = {
  src: string | null;
  durationMs: number;
  mine: boolean;
  /** Envoi en cours : lecture possible sur l'appareil de l'expéditeur, mais pas encore sur le serveur */
  label?: string;
};

export default function VoicePlayer({ src, durationMs, mine, label }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);

  // Les enregistrements du navigateur n'indiquent pas toujours leur durée : on se fie à celle enregistrée
  const total = Math.max(durationMs, 1);
  const progress = Math.min(1, currentMs / total);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && currentAudio === audio) currentAudio = null;
    };
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (currentAudio && currentAudio !== audio) currentAudio.pause();
    currentAudio = audio;
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const ms = (value / 1000) * total;
    audio.currentTime = ms / 1000;
    setCurrentMs(ms);
  }

  return (
    <div className="flex w-56 items-center gap-2.5 py-1 sm:w-64">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!src}
        aria-label={playing ? "Mettre le vocal en pause" : "Écouter le vocal"}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          mine ? "bg-accent text-accent-ink" : "bg-brand text-brand-ink"
        } disabled:opacity-50`}
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Position dans le vocal"
          className={`h-1.5 w-full cursor-pointer ${mine ? "accent-accent" : "accent-brand"}`}
        />
        <p className={`mt-1 text-[11px] leading-none ${mine ? "text-bubble-out-ink/70" : "text-muted"}`}>
          {label ?? formatDuration(playing || currentMs > 0 ? currentMs : durationMs)}
        </p>
      </div>

      {src ? (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrentMs(0);
          }}
          onTimeUpdate={(event) => setCurrentMs(event.currentTarget.currentTime * 1000)}
        />
      ) : null}
    </div>
  );
}
