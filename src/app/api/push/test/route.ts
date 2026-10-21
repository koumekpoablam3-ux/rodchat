import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { pushConfigured, pushProblem, sendPushToUsers } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

/** Envoie une notification de test aux appareils de la personne et dit précisément ce qui manque si rien ne part */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!rateLimit(`push-test:${userId}`, 6, 60_000).ok) {
    return NextResponse.json({ error: "Trop d'essais : attends une minute." }, { status: 429 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ error: pushProblem() ?? "Les notifications ne sont pas configurées." }, { status: 503 });
  }
  const devices = await prisma.pushSubscription.count({ where: { userId } });
  if (devices === 0) {
    return NextResponse.json(
      { error: "Aucun appareil n'est abonné à ton compte. Active d'abord les notifications sur cet appareil." },
      { status: 404 },
    );
  }

  const result = await sendPushToUsers([userId], {
    title: "Rodchat",
    body: "Les notifications fonctionnent sur cet appareil.",
    url: "/chat",
    tag: "test",
    force: true,
  });
  if (result.sent === 0 && result.statuses.some((status) => status === 401 || status === 403)) {
    return NextResponse.json(
      {
        error:
          "Le service de notifications refuse nos clés : la clé publique et la clé privée ne forment pas une paire, ou elles ont changé depuis l'activation sur cet appareil. Désactive puis réactive les notifications ici. Si ça persiste, régénère une seule paire de clés et remets les deux dans Vercel.",
      },
      { status: 502 },
    );
  }
  if (result.sent === 0) {
    return NextResponse.json(
      { error: "L'envoi a échoué (abonnement expiré ?). Désactive puis réactive les notifications sur cet appareil." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, devices: result.sent });
}
