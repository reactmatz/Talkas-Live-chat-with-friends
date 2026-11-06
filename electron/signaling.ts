import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import {
  MAX_CHAT_LENGTH,
  MAX_MESSAGE_BYTES,
  NO_MEDIA,
  SIGNAL_PATH,
  type ChatMessage,
  type ClientMessage,
  type Member,
  type ServerInfo,
  type ServerMessage,
} from "../shared/protocol";

interface Client {
  socket: WebSocket;
  member: Member;
  alive: boolean;
  tokens: number; // rate limit bucket
}

export interface HostOptions {
  name: string;
  port: number;
  dataDir: string;
}

export interface HostInfo {
  running: boolean;
  name: string;
  port: number;
  inviteKey: string;
  addresses: string[]; // ws://ip:port for LAN / tunnel use
}

const HISTORY_PER_CHANNEL = 200;
const RATE_PER_SECOND = 60;

/**
 * Lightweight signaling + presence server, embedded in the host's Electron main process.
 *
 * Responsibilities (and nothing more):
 *  - authenticate peers with the invite key,
 *  - keep the member list, voice-room membership and text-chat history,
 *  - relay SDP offers/answers and ICE candidates between two peers of the same voice room.
 * It never sees media: once ICE connects, RTP flows directly between the peers.
 */
export class SignalingServer {
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Client>();
  private voice = new Map<string, Set<string>>(); // channelId -> member ids
  private history: Record<string, ChatMessage[]> = {};
  private timers: NodeJS.Timeout[] = [];
  private saveTimer: NodeJS.Timeout | null = null;
  private info: HostInfo = { running: false, name: "", port: 0, inviteKey: "", addresses: [] };
  private server: ServerInfo = { name: "", channels: [] };
  private historyFile = "";

  async start(opts: HostOptions): Promise<HostInfo> {
    await this.stop();
    this.server = {
      name: opts.name,
      channels: [
        { id: "general", name: "general", kind: "text" },
        { id: "clips", name: "clips-and-links", kind: "text" },
        { id: "lounge", name: "Lounge", kind: "voice" },
        { id: "gaming", name: "Gaming", kind: "voice" },
        { id: "watch", name: "Watch Party", kind: "voice" },
      ],
    };
    for (const c of this.server.channels) if (c.kind === "voice") this.voice.set(c.id, new Set());

    mkdirSync(opts.dataDir, { recursive: true });
    this.historyFile = join(opts.dataDir, "chat-history.json");
    try {
      this.history = JSON.parse(readFileSync(this.historyFile, "utf8"));
    } catch {
      this.history = {};
    }

    const inviteKey = randomBytes(4).toString("hex").toUpperCase(); // 8 chars, shared with friends
    this.http = createServer((_, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("Talkas signaling server");
    });
    this.wss = new WebSocketServer({ server: this.http, path: SIGNAL_PATH, maxPayload: MAX_MESSAGE_BYTES });
    this.wss.on("connection", (socket) => this.onConnection(socket));

    await new Promise<void>((resolve, reject) => {
      this.http!.once("error", reject);
      this.http!.listen(opts.port, "0.0.0.0", () => resolve());
    });

    // Heartbeat: drop sockets that stopped answering pings (sleeping laptops, dead Wi-Fi).
    this.timers.push(
      setInterval(() => {
        for (const [id, c] of this.clients) {
          if (!c.alive) {
            c.socket.terminate();
            this.remove(id);
            continue;
          }
          c.alive = false;
          c.socket.ping();
        }
      }, 15_000),
      // Refill rate-limit buckets.
      setInterval(() => {
        for (const c of this.clients.values()) c.tokens = RATE_PER_SECOND;
      }, 1_000),
    );

    this.info = { running: true, name: opts.name, port: opts.port, inviteKey, addresses: lanAddresses(opts.port) };
    return this.info;
  }

  async stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.flushHistory();
    for (const c of this.clients.values()) c.socket.close(1001, "Host stopped");
    this.clients.clear();
    this.voice.clear();
    await new Promise<void>((r) => (this.wss ? this.wss.close(() => r()) : r()));
    await new Promise<void>((r) => (this.http ? this.http.close(() => r()) : r()));
    this.wss = null;
    this.http = null;
    this.info = { running: false, name: "", port: 0, inviteKey: "", addresses: [] };
  }

  getInfo(): HostInfo {
    return this.info;
  }

  // ------------------------------------------------------------------ connections

  private onConnection(socket: WebSocket) {
    let id: string | null = null;
    const helloTimeout = setTimeout(() => socket.close(4001, "No hello"), 5_000);

    socket.on("pong", () => {
      if (id) this.clients.get(id)!.alive = true;
    });

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!id) {
        if (msg.t !== "hello" || !this.validKey(msg.key)) {
          send(socket, { t: "error", message: "Invalid invite key." });
          socket.close(4003, "Invalid key");
          return;
        }
        clearTimeout(helloTimeout);
        id = randomUUID().slice(0, 8);
        const member: Member = {
          id,
          name: String(msg.name).trim().slice(0, 32) || "Guest",
          hue: Math.abs(Number(msg.hue) || 0) % 360,
          state: { ...NO_MEDIA },
        };
        this.clients.set(id, { socket, member, alive: true, tokens: RATE_PER_SECOND });
        send(socket, {
          t: "welcome",
          selfId: id,
          server: this.server,
          members: [...this.clients.values()].map((c) => c.member),
          voice: this.voiceMap(),
          history: this.history,
        });
        this.broadcast({ t: "member_join", member }, id);
        return;
      }

      const client = this.clients.get(id);
      if (!client || client.tokens-- <= 0) return; // rate limited: drop silently
      this.handle(client, msg);
    });

    socket.on("close", () => {
      clearTimeout(helloTimeout);
      if (id) this.remove(id);
    });
    socket.on("error", () => socket.terminate());
  }

  private handle(c: Client, msg: ClientMessage) {
    const id = c.member.id;
    switch (msg.t) {
      case "join_voice": {
        if (!this.voice.has(msg.channelId)) return;
        this.leaveVoice(id);
        this.voice.get(msg.channelId)!.add(id);
        this.broadcast({ t: "voice", voice: this.voiceMap() });
        return;
      }
      case "leave_voice":
        this.leaveVoice(id);
        c.member.state = { ...NO_MEDIA, muted: c.member.state.muted, deafened: c.member.state.deafened };
        this.broadcast({ t: "voice", voice: this.voiceMap() });
        return;
      case "state":
        c.member.state = {
          muted: !!msg.state.muted,
          deafened: !!msg.state.deafened,
          camera: !!msg.state.camera,
          sharing: !!msg.state.sharing,
        };
        this.broadcast({ t: "member_state", id, state: c.member.state });
        return;
      case "signal": {
        // Only relay handshakes between two members of the same voice room.
        const room = this.roomOf(id);
        const target = this.clients.get(msg.to);
        if (!room || !target || this.roomOf(msg.to) !== room) return;
        send(target.socket, { t: "signal", from: id, data: msg.data });
        return;
      }
      case "chat": {
        const channel = this.server.channels.find((ch) => ch.id === msg.channelId && ch.kind === "text");
        const text = String(msg.text ?? "").trim().slice(0, MAX_CHAT_LENGTH);
        if (!channel || !text) return;
        const message: ChatMessage = {
          id: randomUUID(),
          channelId: channel.id,
          authorId: id,
          authorName: c.member.name,
          authorHue: c.member.hue,
          text,
          at: Date.now(),
        };
        const list = (this.history[channel.id] ??= []);
        list.push(message);
        if (list.length > HISTORY_PER_CHANNEL) list.splice(0, list.length - HISTORY_PER_CHANNEL);
        this.scheduleSave();
        this.broadcast({ t: "chat", message });
        return;
      }
    }
  }

  // ------------------------------------------------------------------ helpers

  private validKey(key: unknown) {
    const a = Buffer.from(String(key ?? "").trim().toUpperCase());
    const b = Buffer.from(this.info.inviteKey);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private remove(id: string) {
    if (!this.clients.delete(id)) return;
    this.leaveVoice(id);
    this.broadcast({ t: "member_leave", id });
    this.broadcast({ t: "voice", voice: this.voiceMap() });
  }

  private leaveVoice(id: string) {
    for (const set of this.voice.values()) set.delete(id);
  }

  private roomOf(id: string) {
    for (const [room, set] of this.voice) if (set.has(id)) return room;
    return null;
  }

  private voiceMap() {
    return Object.fromEntries([...this.voice].map(([k, v]) => [k, [...v]]));
  }

  private broadcast(msg: ServerMessage, except?: string) {
    const data = JSON.stringify(msg);
    for (const [id, c] of this.clients) if (id !== except && c.socket.readyState === WebSocket.OPEN) c.socket.send(data);
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flushHistory(), 2_000);
  }

  private flushHistory() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.historyFile) return;
    try {
      writeFileSync(this.historyFile, JSON.stringify(this.history));
    } catch {
      // history is a convenience; never crash the host over it
    }
  }
}

function send(socket: WebSocket, msg: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function lanAddresses(port: number) {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(`ws://${a.address}:${port}`);
  return out;
}
