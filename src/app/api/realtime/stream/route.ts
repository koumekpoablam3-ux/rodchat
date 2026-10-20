import { badRequest, unauthorized } from "@/lib/api";
import { purgeExpiredMessages } from "@/lib/expiry";
import { prisma } from "@/lib/prisma";
import { ONLINE_WINDOW_MS, purgeOldEvents } from "@/lib/realtime";
import { deliverPending } from "@/lib/rt-actions";
import { pendingCallEvents, sweepCalls } from "@/lib/rt-calls";
import { sendDueScheduledMessages } from "@/lib/scheduled";
import { getSessionUserId } from "@/lib/session";
import { NextResponse } from "next/server";

// Flux temps réel (Server-Sent Events). Remplace la connexion WebSocket de Socket.IO, que Vercel ne sait pas tenir.
//
// Le navigateur ouvre ce flux ; la fonction relit la table RealtimeEvent de Neon toutes les 500 ms et lui renvoie
// ce qui le concerne (ses événements personnels, ceux de ses discussions, ceux de cet onglet). Au bout de
// ~50 s, elle envoie « rotate » et se ferme : le navigateur rouvre aussitôt un flux en reprenant à son dernier
// événement (`after`), sans rien perdre. C'est ce qui permet de rester sous la durée maximale d'une fonction Vercel.
//
// Le même flux fait aussi office de signe de vie : tant qu'il tourne, l'appareil est « en ligne ».

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chaque lecture est une requête vers Neon, et un flux reste ouvert tant que l'application l'est : on lit vite quand
// ça compte (appel en cours, échanges en cours) et lentement au repos. Neon (et le quota de Vercel) s'en trouvent
// bien moins sollicités, et la file de signalisation des appels reste réactive.
const POLL_CALL_MS = 250; // appel en cours (le navigateur ajoute ?fast=1)
const POLL_BUSY_MS = 400; // de l'activité vient d'arriver
const POLL_IDLE_MS = 1_000; // au repos
const BUSY_WINDOW_MS = 15_000;
const BEAT_MS = 8_000;
const SWEEP_CALL_MS = 5_000;
const SWEEP_IDLE_MS = 10_000;
const SCHEDULED_MS = 15_000;
const PRESENCE_MS = 10_000;
const PING_MS = 15_000;
const LAST_SEEN_MS = 60_000;
const LIFETIME_MS = 50_000;

const CONN_ID = /^[A-Za-z0-9_-]{8,64}$/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type EventRow = { id: number; event: string; payload: unknown };

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const params = new URL(req.url).searchParams;
  const connId = params.get("conn") ?? "";
  if (!CONN_ID.test(connId)) return badRequest("Identifiant de connexion invalide.");
  const resume = params.get("resume") === "1";
  const after = Number(params.get("after"));
  const fast = params.get("fast") === "1";

  // Cet onglet m'appartient (un identifiant déjà pris par quelqu'un d'autre est refusé)
  const existing = await prisma.realtimeConnection.findUnique({ where: { id: connId }, select: { userId: true } });
  if (existing && existing.userId !== userId) {
    return NextResponse.json({ error: "Connexion déjà utilisée." }, { status: 409 });
  }
  await prisma.realtimeConnection.upsert({
    where: { id: connId },
    create: { id: connId, userId, beatAt: new Date() },
    update: { beatAt: new Date() },
  });

  // Reprise après une rotation : on repart de l'événement suivant. Sinon, on ne rejoue pas l'historique.
  let cursor: number;
  if (resume && Number.isInteger(after) && after >= 0) {
    cursor = after;
  } else {
    const latest = await prisma.realtimeEvent.aggregate({ _max: { id: true } });
    cursor = latest._max.id ?? 0;
  }

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (event: string, payload: unknown, id?: number) =>
        write(`${id !== undefined ? `id: ${id}\n` : ""}data: ${JSON.stringify({ e: event, p: payload ?? null })}\n\n`);

      const fetchEvents = () =>
        // Un événement n'est livré qu'une fois « posé » (200 ms) : évite de rater une ligne validée en retard par la base
        prisma.$queryRaw<EventRow[]>`
          SELECT e."id", e."event", e."payload"
          FROM "RealtimeEvent" e
          WHERE e."id" > ${cursor}
            AND e."createdAt" <= (now() AT TIME ZONE 'UTC') - interval '200 milliseconds'
            AND (e."exceptConn" IS NULL OR e."exceptConn" <> ${connId})
            AND (
              e."room" = ${`user:${userId}`}
              OR e."room" = ${`conn:${connId}`}
              OR EXISTS (
                SELECT 1 FROM "Participant" p
                WHERE p."userId" = ${userId}
                  AND e."room" = 'conv:' || p."conversationId"
                  AND e."createdAt" >= p."joinedAt"
              )
            )
          ORDER BY e."id" ASC
          LIMIT 200`;

      /** Personnes de mes discussions qui ont un appareil connecté */
      const onlineContacts = async () => {
        const rows = await prisma.realtimeConnection.findMany({
          where: {
            beatAt: { gt: new Date(Date.now() - ONLINE_WINDOW_MS) },
            userId: { not: userId },
            user: { participations: { some: { conversation: { participants: { some: { userId } } } } } },
          },
          select: { userId: true },
          distinct: ["userId"],
        });
        return new Set(rows.map((r) => r.userId));
      };

      void (async () => {
        const deadline = Date.now() + LIFETIME_MS;
        let lastBeat = Date.now();
        let lastSweep = Date.now();
        let lastScheduled = Date.now();
        let lastActivity = resume ? 0 : Date.now();
        let lastPresence = Date.now();
        let lastPing = Date.now();
        let lastSeenWrite = 0;
        let known = new Set<string>();

        try {
          write("retry: 1000\n\n");
          send("ready", { connId, cursor });

          // État de départ : reçus en attente, qui est en ligne, appels qui sonnent
          await deliverPending(userId);
          known = await onlineContacts();
          send("presence:list", Array.from(known));
          if (!resume) {
            for (const item of await pendingCallEvents(userId)) send(item.event, item.payload);
          }

          while (!closed && Date.now() < deadline) {
            const rows = await fetchEvents();
            for (const row of rows) {
              send(row.event, row.payload, row.id);
              cursor = row.id;
            }
            if (rows.length > 0) lastActivity = Date.now();

            const now = Date.now();

            if (now - lastBeat >= BEAT_MS) {
              lastBeat = now;
              await prisma.realtimeConnection.upsert({
                where: { id: connId },
                create: { id: connId, userId, beatAt: new Date() },
                update: { beatAt: new Date() },
              });
              if (now - lastSeenWrite >= LAST_SEEN_MS) {
                lastSeenWrite = now;
                await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
              }
              // Ménage au passage (quelques fois par minute suffisent)
              if (Math.random() < 0.15) {
                purgeOldEvents().catch((error) => console.error("[realtime:purge]", error));
              }
              if (Math.random() < 0.15) {
                purgeExpiredMessages().catch((error) => console.error("[expiry]", error));
              }
            }

            if (now - lastSweep >= (fast ? SWEEP_CALL_MS : SWEEP_IDLE_MS)) {
              lastSweep = now;
              await sweepCalls();
            }

            // Messages programmés dont l'heure est venue (sans jamais faire tomber le flux)
            if (now - lastScheduled >= SCHEDULED_MS) {
              lastScheduled = now;
              await sendDueScheduledMessages().catch((error) => console.error("[scheduled]", error));
            }

            if (now - lastPresence >= PRESENCE_MS) {
              lastPresence = now;
              const current = await onlineContacts();
              for (const id of current) if (!known.has(id)) send("presence", { userId: id, online: true });
              const left = Array.from(known).filter((id) => !current.has(id));
              if (left.length > 0) {
                const users = await prisma.user.findMany({
                  where: { id: { in: left } },
                  select: { id: true, lastSeenAt: true, lastSeenVisible: true },
                });
                for (const id of left) {
                  const user = users.find((u) => u.id === id);
                  send("presence", {
                    userId: id,
                    online: false,
                    ...(user?.lastSeenVisible && user.lastSeenAt ? { lastSeenAt: user.lastSeenAt.toISOString() } : {}),
                  });
                }
              }
              known = current;
            }

            if (now - lastPing >= PING_MS) {
              lastPing = now;
              write(": ping\n\n");
            }

            await sleep(fast ? POLL_CALL_MS : Date.now() - lastActivity < BUSY_WINDOW_MS ? POLL_BUSY_MS : POLL_IDLE_MS);
          }
          send("rotate", { cursor });
        } catch (error) {
          console.error("[realtime:stream]", error);
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            /* déjà fermé par le navigateur */
          }
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
