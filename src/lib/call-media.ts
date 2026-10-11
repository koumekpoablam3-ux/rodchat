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

/** Micro (et caméra pour la vidéo). En groupe, l'image est plus petite : chaque personne l'envoie à tous les autres. */
export async function acquireMedia(kind: CallKind, options: { group?: boolean } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("insecure"), { name: "SecurityError" });
  }
  const size = options.group ? { width: { ideal: 640 }, height: { ideal: 360 } } : { width: { ideal: 1280 }, height: { ideal: 720 } };
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: kind === "VIDEO" ? { facingMode: "user", ...size } : false,
  });
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await fetch("/api/calls/ice");
    if (response.ok) return ((await response.json()) as { iceServers: RTCIceServer[] }).iceServers;
  } catch {
    /* on retombe sur le serveur public ci-dessous */
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}
