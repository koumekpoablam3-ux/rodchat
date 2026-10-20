"use client";

// Client temps réel. Il reprend la petite partie de l'API de Socket.IO que l'application utilise
// (on / off / emit avec réponse / timeout / connected / connect / disconnect), mais fonctionne sur Vercel :
//
//   serveur → navigateur : un flux SSE (/api/realtime/stream), rouvert toutes les ~50 s sans rien perdre
//   navigateur → serveur : des requêtes POST (/api/realtime/action)
//
// Les composants (ChatProvider, appels…) n'ont donc presque pas changé.

type Listener = (...args: any[]) => void;
type Callback = (error: Error | null, response?: any) => void;

/** Sans nouvelle connexion réussie au bout de ce délai, on déclare « déconnecté » (les rotations normales n'en font pas partie) */
const LOST_AFTER_MS = 8_000;
const RETRY_SEND_MS = 2_000;
/** Onglet caché depuis ce délai (et hors appel) : on coupe le flux. Neon peut alors se rendormir, et les notifications push prennent le relais. */
const HIDDEN_PAUSE_MS = 60_000;

function newConnectionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

class RealtimeClient {
  connected = false;

  private readonly connId = newConnectionId();
  private listeners = new Map<string, Set<Listener>>();
  private source: EventSource | null = null;
  private cursor = 0;
  private wanted = false;
  private failures = 0;
  private needFresh = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lostTimer: ReturnType<typeof setTimeout> | null = null;
  private signalQueue: Promise<unknown> = Promise.resolve();
  private bound = false;
  private holds = 0;
  private paused = false;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  // --- API façon Socket.IO ---

  on(event: string, listener: Listener) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    return this;
  }

  off(event: string, listener?: Listener) {
    if (!listener) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(listener);
    return this;
  }

  /** emit("événement", données, (réponse) => …) */
  emit(event: string, data?: unknown, ack?: (response?: any) => void) {
    void this.post(event, data, ack ? (_error, response) => ack(response) : undefined, 0);
    return this;
  }

  /** timeout(ms).emit("événement", données, (erreur, réponse) => …) : réessaie tant que le réseau manque, jusqu'au délai */
  timeout(ms: number) {
    return {
      emit: (event: string, data: unknown, callback: Callback) => {
        void this.post(event, data, callback, ms);
      },
    };
  }

  /**
   * Garde le flux ouvert même si l'onglet est en arrière-plan (appel en cours).
   * À appeler avec true au début de l'appel et false à la fin.
   */
  holdOpen(on: boolean) {
    const before = this.holds;
    this.holds = Math.max(0, this.holds + (on ? 1 : -1));
    if (this.holds === 0) this.schedulePause();
    else this.cancelPause();
    // Début d'appel : on rouvre le flux en mode rapide, à partir du dernier événement reçu (rien n'est perdu).
    // À la fin de l'appel, la prochaine rotation (≤ 50 s) revient d'elle-même au rythme normal.
    if (before === 0 && this.holds > 0 && this.wanted && !this.paused && this.source) this.open(true);
    return this;
  }

  connect() {
    this.wanted = true;
    this.bindPageEvents();
    if (!this.source) this.open(false);
    return this;
  }

  disconnect() {
    this.wanted = false;
    this.paused = false;
    this.cancelPause();
    this.closeSource();
    this.clearTimers();
    this.sendBye();
    if (this.connected) {
      this.connected = false;
      this.dispatch("disconnect", "io client disconnect");
    }
    this.failures = 0;
    this.needFresh = false;
    return this;
  }

  // --- Flux descendant (SSE) ---

  private dispatch(event: string, ...args: unknown[]) {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`[realtime] « ${event} » :`, error);
      }
    }
  }

  private closeSource() {
    if (this.source) {
      this.source.onmessage = null;
      this.source.onerror = null;
      this.source.close();
      this.source = null;
    }
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.lostTimer) clearTimeout(this.lostTimer);
    this.retryTimer = null;
    this.lostTimer = null;
  }

  private open(resume: boolean) {
    this.closeSource();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;

    const query = new URLSearchParams({
      conn: this.connId,
      after: String(this.cursor),
      resume: resume ? "1" : "0",
      // Pendant un appel, le serveur lit la file de signalisation plus souvent
      fast: this.holds > 0 ? "1" : "0",
    });
    const source = new EventSource(`/api/realtime/stream?${query}`);
    this.source = source;

    source.onmessage = (message: MessageEvent<string>) => {
      const id = Number(message.lastEventId);
      if (Number.isFinite(id) && id > this.cursor) this.cursor = id;

      let frame: { e?: string; p?: unknown };
      try {
        frame = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!frame.e) return;

      if (frame.e === "ready") {
        const cursor = (frame.p as { cursor?: number } | null)?.cursor;
        if (typeof cursor === "number" && cursor > this.cursor) this.cursor = cursor;
        this.markConnected();
        return;
      }
      if (frame.e === "rotate") {
        // Fin normale d'un flux : on en rouvre un aussitôt, à partir du dernier événement reçu
        const cursor = (frame.p as { cursor?: number } | null)?.cursor;
        if (typeof cursor === "number" && cursor > this.cursor) this.cursor = cursor;
        if (this.wanted) this.open(true);
        return;
      }
      this.dispatch(frame.e, frame.p);
    };

    source.onerror = () => {
      // Le navigateur voudrait se reconnecter seul (sans notre curseur) : on reprend la main
      if (this.source !== source) return;
      this.closeSource();
      if (!this.wanted) return;

      this.failures += 1;
      if (this.failures === 1) void this.checkSession();

      if (!this.lostTimer && this.connected) {
        this.lostTimer = setTimeout(() => {
          this.lostTimer = null;
          if (this.connected) {
            this.connected = false;
            // Après une vraie coupure, on repart de zéro : l'application rattrape alors ce qu'elle a manqué
            this.needFresh = true;
            this.dispatch("disconnect", "transport error");
          }
        }, LOST_AFTER_MS);
      }

      const delay = Math.min(500 * this.failures, 5000);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.wanted && !this.source) this.open(!this.needFresh);
      }, delay);
    };
  }

  private markConnected() {
    this.failures = 0;
    if (this.lostTimer) clearTimeout(this.lostTimer);
    this.lostTimer = null;
    this.needFresh = false;
    if (!this.connected) {
      this.connected = true;
      this.dispatch("connect");
    }
  }

  /** Une session expirée fait échouer le flux : on le détecte et on renvoie à la connexion */
  private async checkSession() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.status === 401) {
        this.wanted = false;
        this.closeSource();
        this.clearTimers();
        window.location.href = "/login";
      }
    } catch {
      /* pas de réseau : la reconnexion continue */
    }
  }

  private bindPageEvents() {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;

    // Le réseau revient, ou l'onglet est de nouveau visible : on ne laisse pas un flux mort
    const wake = () => {
      if (!this.wanted) return;
      if (this.paused) {
        // Retour après une pause : repartir de zéro, l'application rattrape ce qu'elle a manqué
        this.paused = false;
        this.needFresh = false;
        this.open(false);
        return;
      }
      if (!this.source || this.source.readyState === EventSource.CLOSED) this.open(!this.needFresh);
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.cancelPause();
        wake();
      } else {
        this.schedulePause();
      }
    });

    // Vraie fermeture de l'onglet (pas une simple mise en arrière-plan) : hors ligne tout de suite
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted && this.wanted) this.sendBye();
    });
  }

  private schedulePause() {
    if (typeof document === "undefined" || this.holds > 0 || document.visibilityState !== "hidden") return;
    if (this.pauseTimer || !this.wanted) return;
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      if (!this.wanted || this.holds > 0 || document.visibilityState !== "hidden") return;
      this.paused = true;
      this.closeSource();
      this.clearTimers();
      this.sendBye();
      if (this.connected) {
        this.connected = false;
        this.dispatch("disconnect", "paused");
      }
    }, HIDDEN_PAUSE_MS);
  }

  private cancelPause() {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  private sendBye() {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon(
        "/api/realtime/bye",
        new Blob([JSON.stringify({ conn: this.connId })], { type: "application/json" }),
      );
    } catch {
      /* sans importance : le signe de vie expire de lui-même */
    }
  }

  // --- Flux montant (POST) ---

  private post(event: string, data: unknown, callback: Callback | undefined, timeoutMs: number): Promise<unknown> {
    const run = () => this.send(event, data, callback, timeoutMs);
    // Les messages de signalisation WebRTC partent dans l'ordre : l'offre ne doit pas doubler les candidats
    if (event === "call:signal" || event === "groupcall:signal") {
      this.signalQueue = this.signalQueue.then(run, run);
      return this.signalQueue;
    }
    return run();
  }

  private async send(event: string, data: unknown, callback: Callback | undefined, timeoutMs: number) {
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : 0;

    for (;;) {
      try {
        const response = await fetch("/api/realtime/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conn: this.connId, event, data }),
        });
        if (response.status === 401) {
          callback?.(new Error("unauthorized"));
          void this.checkSession();
          return;
        }
        if (response.status >= 500 || response.status === 429) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json().catch(() => ({}))) as { ack?: unknown };
        callback?.(null, body.ack ?? undefined);
        return;
      } catch {
        // Hors ligne : si un délai est donné (envoi d'un message), on réessaie. Le clientId évite les doublons.
        if (deadline && Date.now() + RETRY_SEND_MS < deadline) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_SEND_MS));
          continue;
        }
        callback?.(new Error("timeout"));
        return;
      }
    }
  }
}

let client: RealtimeClient | null = null;

export function getSocket(): RealtimeClient {
  if (!client) client = new RealtimeClient();
  return client;
}
