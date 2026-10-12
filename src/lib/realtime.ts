import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Temps réel sans serveur WebSocket (Vercel + Neon seulement).
//
// Tout ce que le code « métier » (routes API, messages, discussions, appels) veut diffuser est écrit dans la
// table RealtimeEvent de Neon. Chaque navigateur garde ouvert un flux SSE (/api/realtime/stream) qui relit
// cette table pour lui seul et lui renvoie ses événements. Rien n'est tenu en mémoire : n'importe quelle
// fonction Vercel peut émettre, n'importe quelle autre peut servir le flux.
//
// Rooms : « user:<id> » (tous les appareils d'une personne), « conv:<id> » (les membres d'une discussion,
// calculés à la lecture à partir de la table Participant) et « conn:<id> » (un seul onglet, pour les appels).

export type EmitItem = {
  rooms: string | string[];
  event: string;
  payload?: unknown;
  /** Appareil (identifiant de connexion) qui ne doit pas recevoir l'événement */
  exceptConn?: string;
};

export type Realtime = {
  emit(rooms: string | string[], event: string, payload?: unknown, exceptConn?: string): Promise<void>;
  /** Plusieurs diffusions en une seule écriture */
  emitBatch(items: EmitItem[]): Promise<void>;
  /** Sans effet : l'appartenance aux discussions est relue en base à chaque envoi du flux. Gardé pour les appelants. */
  joinUsers(userIds: string[], room: string): Promise<void>;
  leaveUser(userId: string, room: string): Promise<void>;
  /** Parmi ces personnes, lesquelles ont au moins un appareil connecté */
  onlineUsers(userIds: string[]): Promise<Set<string>>;
};

/** Un appareil est « connecté » tant que son flux a donné signe de vie il y a moins de 30 s */
export const ONLINE_WINDOW_MS = 30_000;

export const onlineSince = () => new Date(Date.now() - ONLINE_WINDOW_MS);

async function emitBatch(items: EmitItem[]) {
  const data: Prisma.RealtimeEventCreateManyInput[] = [];
  for (const item of items) {
    const rooms = Array.isArray(item.rooms) ? item.rooms : [item.rooms];
    const payload = item.payload === undefined || item.payload === null ? Prisma.JsonNull : toJsonValue(item.payload);
    for (const room of new Set(rooms)) {
      data.push({ room, event: item.event, payload, exceptConn: item.exceptConn ?? null });
    }
  }
  if (data.length === 0) return;
  try {
    await prisma.realtimeEvent.createMany({ data });
  } catch (error) {
    // Un événement perdu ne doit jamais faire échouer l'action de la personne : les appareils se
    // resynchronisent à leur prochaine connexion.
    console.error("[realtime] émission impossible :", error instanceof Error ? error.message : error);
  }
}

/** Dates, etc. : même forme JSON que celle que Socket.IO envoyait */
function toJsonValue(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

const realtime: Realtime = {
  emit: (rooms, event, payload, exceptConn) => emitBatch([{ rooms, event, payload, exceptConn }]),
  emitBatch,
  joinUsers: async () => {},
  leaveUser: async () => {},
  onlineUsers: async (userIds) => {
    if (userIds.length === 0) return new Set<string>();
    const rows = await prisma.realtimeConnection.findMany({
      where: { userId: { in: userIds }, beatAt: { gt: onlineSince() } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return new Set(rows.map((r) => r.userId));
  },
};

/** Le temps réel est toujours disponible : c'est simplement la base de données. */
export function getRealtime(): Realtime {
  return realtime;
}

/** Supprime les événements trop anciens (un appareil absent depuis plus longtemps se resynchronise par l'API) */
export async function purgeOldEvents() {
  await prisma.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 10 * 60_000) } } });
  await prisma.realtimeConnection.deleteMany({ where: { beatAt: { lt: new Date(Date.now() - 60 * 60_000) } } });
  await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 60 * 60_000) } } });
}
