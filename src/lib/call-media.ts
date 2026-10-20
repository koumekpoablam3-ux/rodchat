import type { CallKind } from "@/types/chat";

/** Message clair pour une erreur d'accès au micro ou à la caméra */
export function mediaErrorMessage(error: unknown, kind: CallKind) {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return kind === "VIDEO"
      ? "Autorise le micro et la caméra dans ton navigateur pour passer un appel vidéo."
      : "Autorise le micro dans ton navigateur pour passer un appel.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return kind === "VIDEO" ? "Aucune caméra ou aucun micro détecté." : "Aucun micro détecté sur cet appareil.";
  }
  if (name === "NotReadableError") return "Le micro ou la caméra est déjà utilisé par une autre application.";
  return "Impossible d'accéder au micro ou à la caméra.";
}

/**
 * Micro (et caméra pour la vidéo). Image volontairement légère : un appel passe mieux sur un réseau mobile moyen
 * en 640×360 qu'en 720p qui sature la connexion, et consomme bien moins de données. En groupe, l'image est encore
 * plus petite : chaque personne l'envoie à tous les autres.
 */
export async function acquireMedia(kind: CallKind, options: { group?: boolean } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("insecure"), { name: "SecurityError" });
  }
  const size = options.group
    ? { width: { ideal: 480 }, height: { ideal: 270 }, frameRate: { ideal: 15, max: 24 } }
    : { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } };
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    video: kind === "VIDEO" ? { facingMode: "user", ...size } : false,
  });
}

/** Plafonds de débit (bits/s) : sans eux, le navigateur monte jusqu'à saturer la connexion, et l'appel saccade puis coupe */
export const CALL_BITRATE = {
  audio: 32_000,
  video: 600_000,
  groupVideo: 250_000,
  screen: 1_500_000,
} as const;

/** Applique les plafonds de débit aux flux envoyés. Sans effet (et sans erreur) si le navigateur ne sait pas. */
export async function capSenderBitrates(pc: RTCPeerConnection, limits: { audio?: number; video?: number }) {
  for (const sender of pc.getSenders()) {
    const kind = sender.track?.kind;
    const max = kind === "audio" ? limits.audio : kind === "video" ? limits.video : undefined;
    if (!max) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = max;
      await sender.setParameters(params);
    } catch {
      /* navigateur qui n'accepte pas : on garde le réglage par défaut */
    }
  }
}

/**
 * Regroupe les candidats ICE : un envoi par candidat, c'était une requête serveur complète chacun, envoyée l'une
 * après l'autre (des dizaines de secondes avant que l'appel ne démarre sur un réseau lent). Ici ils partent par lots.
 */
export function createCandidateBatcher(send: (candidates: RTCIceCandidateInit[]) => void, delayMs = 250) {
  let buffer: RTCIceCandidateInit[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    send(batch);
  };
  return {
    add(candidate: RTCIceCandidateInit) {
      buffer.push(candidate);
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      buffer = [];
    },
  };
}

/** Candidats reçus : un lot (`candidates`) ou un seul (`candidate`, anciens appareils) */
export function candidatesOf(data: { candidate?: RTCIceCandidateInit; candidates?: RTCIceCandidateInit[] }) {
  return [...(data.candidates ?? []), ...(data.candidate ? [data.candidate] : [])];
}

let iceCache: { servers: RTCIceServer[]; at: number } | null = null;
const ICE_CACHE_MS = 10 * 60_000;

/** Serveurs STUN/TURN. Gardés 10 minutes : on ne refait pas une requête serveur à chaque appel (ça retardait le décrochage). */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() - iceCache.at < ICE_CACHE_MS) return iceCache.servers;
  try {
    const response = await fetch("/api/calls/ice");
    if (response.ok) {
      const servers = ((await response.json()) as { iceServers: RTCIceServer[] }).iceServers;
      iceCache = { servers, at: Date.now() };
      return servers;
    }
  } catch {
    /* on retombe sur le serveur public ci-dessous */
  }
  return iceCache?.servers ?? [{ urls: "stun:stun.l.google.com:19302" }];
}
