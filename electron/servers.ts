import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Channel, ChannelKind } from "../shared/protocol";

/** A server you own: saved on this PC, editable while offline, hosted when you "Go live". */
export interface SavedServer {
  id: string;
  name: string;
  channels: Channel[];
  createdAt: number;
}

const MAX_CHANNELS = 40;
const newId = () => randomBytes(5).toString("hex");

function cleanName(v: unknown, max: number, fallback: string) {
  return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max) || fallback;
}

function cleanChannels(list: unknown): Channel[] {
  const seen = new Set<string>();
  const out: Channel[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const kind: ChannelKind = raw?.kind === "voice" ? "voice" : "text";
    let id = String(raw?.id ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    let name = cleanName(raw?.name, 32, kind === "text" ? "new-channel" : "New Voice");
    if (kind === "text") name = name.toLowerCase().replace(/\s+/g, "-");
    out.push({ id, name, kind });
    if (out.length >= MAX_CHANNELS) break;
  }
  return out;
}

export class ServerStore {
  private servers: SavedServer[] = [];

  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      this.servers = (Array.isArray(raw) ? raw : []).map((s) => ({
        id: String(s.id),
        name: cleanName(s.name, 40, "My Server"),
        channels: cleanChannels(s.channels),
        createdAt: Number(s.createdAt) || Date.now(),
      }));
    } catch {
      this.servers = [];
    }
  }

  list() {
    return this.servers;
  }

  get(id: string) {
    return this.servers.find((s) => s.id === id) ?? null;
  }

  create(name: string): SavedServer {
    const server: SavedServer = {
      id: newId(),
      name: cleanName(name, 40, "My Server"),
      channels: [
        { id: "general", name: "general", kind: "text" },
        { id: "lounge", name: "Lounge", kind: "voice" },
      ],
      createdAt: Date.now(),
    };
    this.servers.push(server);
    this.save();
    return server;
  }

  update(id: string, patch: { name?: string; channels?: Channel[] }): SavedServer {
    const s = this.get(id);
    if (!s) throw new Error("Server not found.");
    if (patch.name !== undefined) s.name = cleanName(patch.name, 40, s.name);
    if (patch.channels !== undefined) s.channels = cleanChannels(patch.channels);
    this.save();
    return s;
  }

  delete(id: string) {
    this.servers = this.servers.filter((s) => s.id !== id);
    this.save();
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.servers, null, 2));
    renameSync(tmp, this.file); // atomic: never leaves a half-written file
  }
}
