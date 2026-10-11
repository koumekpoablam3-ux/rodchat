"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS } from "@/lib/limits";

export type VoiceRecording = { blob: Blob; durationMs: number };

// MP4 d'abord : lisible partout, y compris sur les iPhone plus anciens
const MIME_CANDIDATES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

function recordingError(error: unknown) {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Autorise l'accès au micro dans ton navigateur pour enregistrer un vocal.";
  }
  if (name === "NotFoundError") return "Aucun micro détecté sur cet appareil.";
  return "Impossible de démarrer l'enregistrement.";
}

/** Enregistrement d'un message vocal avec le micro (appuyer pour démarrer, puis envoyer ou annuler) */
export function useVoiceRecorder(onLimit: (recording: VoiceRecording) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((value: VoiceRecording | null) => void) | null>(null);
  const onLimitRef = useRef(onLimit);

  useEffect(() => {
    onLimitRef.current = onLimit;
  }, [onLimit]);

  const release = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsedMs(0);
  }, []);

  /** Termine l'enregistrement. keep = false : on jette l'audio. */
  const finish = useCallback((keep: boolean) => {
    return new Promise<VoiceRecording | null>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        release();
        return resolve(null);
      }
      resolveRef.current = resolve;
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        release();
        resolveRef.current?.(keep && blob.size > 0 ? { blob, durationMs } : null);
        resolveRef.current = null;
      };
      recorder.stop();
    });
  }, [release]);

  const start = useCallback(async (): Promise<string | null> => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "L'enregistrement vocal n'est pas disponible ici (il faut une connexion HTTPS).";
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 48_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(1000);
      setRecording(true);

      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_VOICE_SECONDS * 1000) {
          void finish(true).then((result) => result && onLimitRef.current(result));
        }
      }, 250);
      return null;
    } catch (error) {
      release();
      return recordingError(error);
    }
  }, [finish, release]);

  const stop = useCallback(() => finish(true), [finish]);
  const cancel = useCallback(() => void finish(false), [finish]);

  // Micro libéré si on quitte la discussion en plein enregistrement
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (tickRef.current) clearInterval(tickRef.current);
    },
    [],
  );

  return { recording, elapsedMs, start, stop, cancel };
}
