import { NextResponse } from "next/server";
import { forbidden, unauthorized } from "@/lib/api";
import { visibleMessagesWhere } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_MESSAGES = 20_000;

/** Fuseau horaire demandé par le navigateur (« Africa/Lome »…), sinon UTC */
function safeTimeZone(value: string | null) {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

// Exporter une discussion en fichier texte : tout ce que je peux y voir (mes messages et ceux des autres),
// depuis mon arrivée. Les photos, vidéos, vocaux et fichiers sont mentionnés mais pas inclus.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`export-chat:${userId}`, 10, 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Trop d'exports. Réessaie plus tard." }, { status: 429 });
  }

  const member = await prisma.participant.findUnique({
    where: { userId_conversationId: { userId, conversationId: params.id } },
    select: {
      joinedAt: true,
      conversation: {
        select: {
          isGroup: true,
          name: true,
          participants: { select: { userId: true, user: { select: { displayName: true } } } },
        },
      },
    },
  });
  if (!member) return forbidden();

  const timeZone = safeTimeZone(new URL(req.url).searchParams.get("tz"));
  const stamp = (date: Date) =>
    date.toLocaleString("fr-FR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id, AND: [visibleMessagesWhere(userId, member.joinedAt)] },
    orderBy: { createdAt: "asc" },
    take: MAX_MESSAGES,
    select: {
      createdAt: true,
      type: true,
      content: true,
      deletedAt: true,
      sender: { select: { displayName: true } },
      attachment: { select: { fileName: true, purgedAt: true } },
    },
  });

  const title = member.conversation.isGroup
    ? (member.conversation.name ?? "Groupe")
    : (member.conversation.participants.find((p) => p.userId !== userId)?.user.displayName ?? "Discussion");

  const lines = messages.map((message) => {
    const when = stamp(message.createdAt);
    if (message.type === "SYSTEM") return `[${when}] — ${message.content ?? ""} —`;
    if (message.type === "CALL") return `[${when}] ${message.sender.displayName} : <appel>`;
    let body: string;
    if (message.deletedAt) body = "<message supprimé>";
    else if (message.type === "TEXT") body = message.content ?? "";
    else if (message.type === "POLL") body = `<sondage> ${message.content ?? ""}`;
    else {
      const kind = { IMAGE: "photo", VIDEO: "vidéo", AUDIO: "message vocal", FILE: "document" }[message.type] ?? "fichier";
      body = message.attachment?.purgedAt ? `<${kind} supprimé(e) pour libérer de l'espace>` : `<${kind} non inclus(e)> ${message.attachment?.fileName ?? ""}`.trim();
    }
    // Les messages sur plusieurs lignes restent lisibles : les lignes suivantes sont décalées
    return `[${when}] ${message.sender.displayName} : ${body.replace(/\n/g, "\n    ")}`;
  });

  const text =
    `Discussion Rodchat : ${title}\n` +
    `Exportée le ${stamp(new Date())} (fuseau ${timeZone}). ${messages.length} message${messages.length > 1 ? "s" : ""}` +
    `${messages.length >= MAX_MESSAGES ? " (les plus anciens)" : ""}.\n` +
    `Les photos, vidéos, vocaux et fichiers ne sont pas inclus.\n\n` +
    lines.join("\n") +
    "\n";

  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "discussion";
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="rodchat-${slug}-${new Date().toISOString().slice(0, 10)}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
