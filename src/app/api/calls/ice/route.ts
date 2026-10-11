import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { getSessionUserId } from "@/lib/session";

// Serveurs utilisés par WebRTC pour mettre deux appareils en relation.
// STUN (gratuit) suffit sur la plupart des réseaux. Certains réseaux mobiles ou d'entreprise
// exigent un serveur TURN : renseigne TURN_URL, TURN_USERNAME et TURN_CREDENTIAL dans le .env.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(",").map((url) => url.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return NextResponse.json({ iceServers });
}
