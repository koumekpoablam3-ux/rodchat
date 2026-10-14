import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Plafond de messages exportés, pour rester dans les limites d'une fonction */
const MAX_MESSAGES = 20_000;

// Télécharger mes données (portabilité) : profil, réglages, discussions et mes propres messages, en JSON.
// Les messages des autres personnes ne sont pas inclus : ce sont leurs données. Les photos, vocaux et fichiers
// sont listés (nom, taille) mais pas inclus : ils pèsent trop lourd pour un export.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!(await rateLimitShared(`export:${userId}`, 3, 60 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Tu as déjà téléchargé tes données plusieurs fois. Réessaie plus tard." }, { status: 429 });
  }

  const [user, participations, messages, statuses, blocks, scheduled] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        displayName: true,
        about: true,
        createdAt: true,
        readReceipts: true,
        lastSeenVisible: true,
      },
    }),
    prisma.participant.findMany({
      where: { userId },
      select: {
        joinedAt: true,
        conversation: {
          select: {
            id: true,
            isGroup: true,
            name: true,
            participants: { select: { user: { select: { displayName: true, username: true } } } },
          },
        },
      },
    }),
    prisma.message.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: "desc" },
      take: MAX_MESSAGES,
      select: {
        id: true,
        conversationId: true,
        type: true,
        content: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        attachment: { select: { fileName: true, mimeType: true, size: true } },
      },
    }),
    prisma.status.findMany({
      where: { authorId: userId, expiresAt: { gt: new Date() } },
      select: { type: true, text: true, createdAt: true, expiresAt: true },
    }),
    prisma.block.findMany({
      where: { blockerId: userId },
      select: { createdAt: true, blocked: { select: { displayName: true, username: true } } },
    }),
    prisma.scheduledMessage.findMany({
      where: { senderId: userId },
      select: { conversationId: true, content: true, sendAt: true },
    }),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    note: "Export de tes données Rodchat. Les messages des autres personnes n'y figurent pas. Les fichiers sont listés mais pas inclus.",
    profile: user,
    conversations: participations.map((p) => ({
      id: p.conversation.id,
      type: p.conversation.isGroup ? "groupe" : "discussion à deux",
      name: p.conversation.name,
      members: p.conversation.participants.map((m) => `${m.user.displayName} (@${m.user.username})`),
      joinedAt: p.joinedAt,
    })),
    myMessages: messages,
    messagesTruncated: messages.length >= MAX_MESSAGES,
    myActiveStatuses: statuses,
    blockedPeople: blocks.map((b) => ({ person: `${b.blocked.displayName} (@${b.blocked.username})`, since: b.createdAt })),
    scheduledMessages: scheduled,
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rodchat-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
