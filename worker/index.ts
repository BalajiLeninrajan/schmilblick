import { DurableObject } from "cloudflare:workers";
import { DECK_TABLE, type GameLength } from "../src/shared/deckTable";
import {
  ACCENTS,
  AFK_MS,
  CODE_ALPHABET,
  CODE_LENGTH,
  NAME_MAX,
  OFFLINE_MS,
  isCode,
  playDuration,
  type Accent,
  type ClientMsg,
  type GameState,
  type LobbyState,
  type PublicPlayer,
  type SeqPlay,
  type ServerMsg,
} from "../src/shared/protocol";
import {
  DEFAULT_SCHMILBLICK_DIE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCHMILBLICK_DICE,
  playTurn,
  type Rng,
  type SchmilblickDie,
} from "../src/shared/rules";

interface Env {
  LOBBY: DurableObjectNamespace<Lobby>;
}

interface Player extends PublicPlayer {
  token: string;
  joinedAt: number;
  goneAt?: number; // last socket closed; they count as away once RECONNECT_GRACE passes
}

interface Stored {
  code: string;
  createdAt: number;
  lastActivity: number;
  phase: LobbyState["phase"];
  length: GameLength;
  sides?: SchmilblickDie; // missing on lobbies made before the die was configurable
  hostId: string | null;
  players: Player[];
  game: (Omit<GameState, "readyIn" | "sides"> & { readyAt: number; seq: number; sides?: SchmilblickDie }) | null;
}

interface Attachment {
  playerId: string;
}

const IDLE_TTL = 3 * 60 * 60 * 1000; // forget a lobby after 3h with nobody connected
const RECONNECT_GRACE = 5_000; // long enough for a page reload to reconnect unnoticed
const LOG_KEEP = 80;

const rng: Rng = (n) => {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
};

const randomId = (len = 10) => {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => abc[rng(abc.length)]).join("");
};

const cleanName = (raw: unknown) => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "");

export class Lobby extends DurableObject<Env> {
  s: Stored | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<Stored>("s")) ?? null;
    });
  }

  // ---- RPC ----

  async create(code: string): Promise<boolean> {
    if (this.s) return false;
    const now = Date.now();
    this.s = {
      code,
      createdAt: now,
      lastActivity: now,
      phase: "lobby",
      length: "medium",
      sides: DEFAULT_SCHMILBLICK_DIE,
      hostId: null,
      players: [],
      game: null,
    };
    await this.save();
    return true;
  }

  async info(): Promise<{ exists: boolean; phase?: string; players?: number }> {
    if (!this.s) return { exists: false };
    return { exists: true, phase: this.s.phase, players: this.s.players.filter((p) => !p.spectator).length };
  }

  // ---- WebSockets ----

  async fetch(req: Request): Promise<Response> {
    if (!this.s) return new Response("no such lobby", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });

    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!/^[a-z0-9]{16,40}$/.test(token)) return new Response("bad token", { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    const existing = this.s.players.find((p) => p.token === token);
    // Unknown tokens connect as nobody until they send a join with a name.
    const attachment: Attachment = { playerId: existing?.id ?? `pending:${token}` };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    if (existing) {
      existing.connected = true;
      delete existing.goneAt;
      this.fixHost();
      await this.commit();
    } else {
      this.sendTo(server, attachment.playerId);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.s || typeof raw !== "string") return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    const err = await this.handle(ws, att, msg);
    if (err) ws.send(JSON.stringify({ t: "error", message: err } satisfies ServerMsg));
  }

  async webSocketClose(ws: WebSocket) {
    await this.dropSocket(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.dropSocket(ws);
  }

  private async dropSocket(ws: WebSocket) {
    if (!this.s) return;
    const { playerId } = ws.deserializeAttachment() as Attachment;
    const p = this.s.players.find((x) => x.id === playerId);
    if (!p) return;
    const stillOpen = this.ctx.getWebSockets().some((o) => o !== ws && (o.deserializeAttachment() as Attachment).playerId === playerId);
    if (stillOpen || !p.connected) return;
    // Don't mark them away yet. A reload reconnects within the grace period; the alarm handles the rest.
    p.goneAt = Date.now();
    await this.save();
    await this.schedule();
  }

  /** Marks players away once their grace period runs out. Returns whether anything changed. */
  private expireGone(now: number) {
    let changed = false;
    for (const p of this.s!.players) {
      if (p.goneAt !== undefined && now - p.goneAt >= RECONNECT_GRACE - 50) {
        p.connected = false;
        delete p.goneAt;
        changed = true;
      }
    }
    if (changed) this.fixHost();
    return changed;
  }

  private async handle(ws: WebSocket, att: Attachment, msg: ClientMsg): Promise<string | void> {
    const s = this.s!;
    const me = s.players.find((p) => p.id === att.playerId);

    if (msg.t === "join") {
      const name = cleanName(msg.name);
      if (!name) return "Pick a name first.";
      if (me) {
        me.name = name;
        return this.commit();
      }
      const token = att.playerId.slice("pending:".length);
      const seated = s.players.filter((p) => !p.spectator).length;
      const spectator = s.phase !== "lobby" || seated >= MAX_PLAYERS;
      const p: Player = {
        id: randomId(),
        token,
        name,
        accent: this.freeAccent(),
        connected: true,
        spectator,
        alive: !spectator,
        cards: 0,
        joinedAt: Date.now(),
      };
      s.players.push(p);
      ws.serializeAttachment({ playerId: p.id } satisfies Attachment);
      this.fixHost();
      return this.commit();
    }

    if (!me) return "Join the lobby first.";

    switch (msg.t) {
      case "length": {
        if (me.id !== s.hostId) return "Only the host picks the length.";
        if (s.phase === "playing") return "A game is running.";
        if (!["short", "medium", "long"].includes(msg.length)) return;
        s.length = msg.length;
        return this.commit();
      }
      case "die": {
        if (me.id !== s.hostId) return "Only the host picks the die.";
        if (s.phase === "playing") return "A game is running.";
        if (!SCHMILBLICK_DICE.includes(msg.sides)) return;
        s.sides = msg.sides;
        return this.commit();
      }
      case "start": {
        if (me.id !== s.hostId) return "Only the host can start.";
        if (s.phase === "playing") return;
        this.startGame();
        if (!s.game) return `Need at least ${MIN_PLAYERS} players online.`;
        return this.commit();
      }
      case "roll": {
        const g = s.game;
        if (s.phase !== "playing" || !g) return;
        if (g.currentId !== me.id) return "Not your turn.";
        if (Date.now() < g.readyAt - 400) return; // still animating the last play
        this.roll();
        return this.commit();
      }
      case "lobby": {
        if (me.id !== s.hostId) return "Only the host can do that.";
        if (s.phase !== "over") return;
        this.toLobby();
        return this.commit();
      }
      case "leave": {
        if (s.phase === "lobby" || me.spectator) {
          s.players = s.players.filter((p) => p.id !== me.id);
        } else {
          // Keep the seat so the game can finish (the alarm rolls for it), but retire the token.
          me.connected = false;
          me.token = randomId(24);
        }
        ws.serializeAttachment({ playerId: "left" } satisfies Attachment);
        this.fixHost();
        await this.commit();
        ws.close(1000, "left");
        return;
      }
    }
  }

  // ---- game ----

  private startGame() {
    const s = this.s!;
    // Seats go to everyone online; offline lobby members are dropped.
    s.players = s.players.filter((p) => p.connected);
    for (const p of s.players.slice(0, MAX_PLAYERS)) p.spectator = false;
    const seated = s.players.filter((p) => !p.spectator);
    if (seated.length < MIN_PLAYERS) {
      s.game = null;
      return;
    }
    for (const p of s.players) {
      p.alive = !p.spectator;
      p.cards = 0;
    }
    const deck = DECK_TABLE[seated.length][s.length].cards;
    const first = seated[rng(seated.length)];
    s.phase = "playing";
    s.game = {
      startDeck: deck,
      deck,
      currentId: first.id,
      seats: seated.map((p) => p.id),
      lastPlay: null,
      log: [],
      ending: null,
      readyAt: Date.now() + 1200,
      seq: 0,
      sides: s.sides ?? DEFAULT_SCHMILBLICK_DIE,
    };
  }

  private roll() {
    const s = this.s!;
    const g = s.game!;
    const seats = g.seats.map((id) => s.players.find((p) => p.id === id)!);
    const play = playTurn(seats, g.currentId!, g.deck, rng, g.sides ?? DEFAULT_SCHMILBLICK_DIE);
    const me = seats.find((p) => p.id === play.playerId)!;
    me.cards += play.took;

    const seqPlay: SeqPlay = { ...play, seq: ++g.seq };
    g.lastPlay = seqPlay;
    g.log = [...g.log, seqPlay].slice(-LOG_KEEP);
    g.deck = play.remaining;
    g.readyAt = Date.now() + playDuration(play);

    if (play.ending) {
      g.ending = play.ending;
      g.currentId = null;
      s.phase = "over";
    } else {
      g.currentId = play.nextId;
    }
  }

  private toLobby() {
    const s = this.s!;
    s.phase = "lobby";
    s.game = null;
    s.players = s.players.filter((p) => p.connected);
    for (const [i, p] of s.players.entries()) {
      p.spectator = i >= MAX_PLAYERS;
      p.alive = true;
      p.cards = 0;
    }
    this.fixHost();
  }

  // ---- alarm: AFK rolls and cleanup ----

  async alarm() {
    const s = this.s;
    if (!s) return;
    const now = Date.now();
    let changed = this.expireGone(now);
    const g = s.game;
    if (s.phase === "playing" && g?.currentId) {
      const cur = s.players.find((p) => p.id === g.currentId);
      const due = g.readyAt + (cur?.connected ? AFK_MS : OFFLINE_MS);
      if (now >= due - 50) {
        this.roll();
        changed = true;
      }
    }
    if (changed) return this.commit();
    if (this.ctx.getWebSockets().length === 0 && now - s.lastActivity >= IDLE_TTL) {
      this.s = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.schedule();
  }

  private async schedule() {
    const s = this.s!;
    const times = [s.lastActivity + IDLE_TTL];
    for (const p of s.players) if (p.goneAt !== undefined) times.push(p.goneAt + RECONNECT_GRACE);
    const g = s.game;
    if (s.phase === "playing" && g?.currentId) {
      const cur = s.players.find((p) => p.id === g.currentId);
      times.push(g.readyAt + (cur?.connected ? AFK_MS : OFFLINE_MS));
    }
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  // ---- helpers ----

  private freeAccent(): Accent {
    const used = new Set(this.s!.players.map((p) => p.accent));
    return ACCENTS.find((a) => !used.has(a)) ?? ACCENTS[this.s!.players.length % ACCENTS.length];
  }

  private fixHost() {
    const s = this.s!;
    const host = s.players.find((p) => p.id === s.hostId);
    if (host?.connected) return;
    const next = s.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    s.hostId = next?.id ?? host?.id ?? null;
  }

  private async save() {
    await this.ctx.storage.put("s", this.s);
  }

  private async commit() {
    this.s!.lastActivity = Date.now();
    await this.save();
    await this.schedule();
    this.broadcast();
  }

  private publicState(): LobbyState {
    const s = this.s!;
    let game: GameState | null = null;
    if (s.game) {
      const { readyAt, seq: _seq, ...rest } = s.game;
      game = { ...rest, sides: rest.sides ?? DEFAULT_SCHMILBLICK_DIE, readyIn: Math.max(0, readyAt - Date.now()) };
    }
    return {
      code: s.code,
      phase: s.phase,
      length: s.length,
      sides: s.sides ?? DEFAULT_SCHMILBLICK_DIE,
      hostId: s.hostId,
      players: s.players.map(({ token: _t, joinedAt: _j, goneAt: _g, ...p }) => p),
      game,
    };
  }

  private sendTo(ws: WebSocket, you: string, state = this.publicState()) {
    try {
      ws.send(JSON.stringify({ t: "state", state, you } satisfies ServerMsg));
    } catch {
      /* socket already gone */
    }
  }

  private broadcast() {
    const state = this.publicState();
    for (const ws of this.ctx.getWebSockets()) {
      this.sendTo(ws, (ws.deserializeAttachment() as Attachment).playerId, state);
    }
  }
}

// ---- Worker ----

const json = (data: unknown, status = 200) => Response.json(data, { status });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["api", "lobbies", CODE?, "ws"?]
    if (parts[0] !== "api" || parts[1] !== "lobbies") return json({ error: "not found" }, 404);

    if (parts.length === 2 && req.method === "POST") {
      for (let i = 0; i < 12; i++) {
        const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[rng(CODE_ALPHABET.length)]).join("");
        if (await env.LOBBY.getByName(code).create(code)) return json({ code });
      }
      return json({ error: "could not find a free code" }, 503);
    }

    const code = (parts[2] ?? "").toUpperCase();
    if (!isCode(code)) return json({ error: "bad code" }, 400);
    const stub = env.LOBBY.getByName(code);

    if (parts.length === 3 && req.method === "GET") return json(await stub.info());
    if (parts.length === 4 && parts[3] === "ws") return stub.fetch(req);
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
