"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/format";

// Un seul vocal à la fois : lancer le suivant met le précédent en pause
let currentAudio: HTMLAudioElement | null = null;

// Vitesse de lecture : 1×, 1,5× ou 2×. Elle vaut pour tous les vocaux jusqu'à ce qu'on la change.
const RATES = [1, 1.5, 2] as const;
let preferredRate: (typeof RATES)[number] = 1;

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
  const [rate, setRate] = useState<(typeof RATES)[number]>(preferredRate);

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
    audio.playbackRate = preferredRate;
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    preferredRate = next;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
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

      <button
        type="button"
        onClick={cycleRate}
        aria-label={`Vitesse de lecture : ${rate === 1 ? "normale" : `${rate} fois`}. Changer.`}
        className={`inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold ${
          mine ? "bg-white/20 text-bubble-out-ink" : "bg-bg text-ink"
        }`}
      >
        {rate === 1 ? "1×" : `${String(rate).replace(".", ",")}×`}
      </button>

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
