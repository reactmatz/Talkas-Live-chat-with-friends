import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * "Where is this server right now?" — lets friends who saved your server join again without a new invite.
 *
 * The internet link (a Cloudflare quick tunnel) changes every time you go live, but the server id and its
 * invite code stay the same. While a server is live, the host posts its current link to a public relay
 * (ntfy.sh, free, no account). Friends who already joined once look it up there.
 *
 * Privacy: the topic name and the encryption key are both derived from server id + invite code, so only
 * people who have the invite can find the topic or read it. The relay only ever sees ciphertext.
 */
const RELAY = "https://ntfy.sh";
const TTL_MS = 12 * 60 * 60 * 1000; // ntfy.sh keeps messages ~12 h; the host re-posts well before that

export interface Beacon {
  online: boolean;
  url: string | null; // wss://….trycloudflare.com
  name: string;
  at: number; // when the host posted it
}

const hash = (label: string, serverId: string, key: string) => createHash("sha256").update(`talkas:${label}:${serverId}:${key.toUpperCase()}`).digest();
const topic = (serverId: string, key: string) => "talkas_" + hash("topic", serverId, key).toString("hex").slice(0, 40);

function seal(serverId: string, key: string, data: Beacon) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", hash("key", serverId, key), iv);
  const body = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

function open(serverId: string, key: string, text: string): Beacon | null {
  try {
    const raw = Buffer.from(text, "base64");
    const d = createDecipheriv("aes-256-gcm", hash("key", serverId, key), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const b = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as Beacon;
    return typeof b?.online === "boolean" ? b : null;
  } catch {
    return null; // someone else's message on the topic, or a different invite code
  }
}

/** Host side: announce the current state. Best effort — a failed post only means friends need a fresh invite. */
export async function publishBeacon(serverId: string, key: string, data: Omit<Beacon, "at">) {
  try {
    await fetch(`${RELAY}/${topic(serverId, key)}`, {
      method: "POST",
      body: seal(serverId, key, { ...data, at: Date.now() }),
      headers: { Cache: "yes", Firebase: "no" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    console.warn("[beacon] publish failed", (e as Error).message);
  }
}

/** Friend side: the newest valid announcement for a saved server, or null when there is none (or no internet). */
export async function lookupBeacon(serverId: string, key: string): Promise<Beacon | null> {
  try {
    const res = await fetch(`${RELAY}/${topic(serverId, key)}/json?poll=1&since=12h`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    let best: Beacon | null = null;
    for (const line of (await res.text()).split("\n")) {
      if (!line.trim()) continue;
      let m: { event?: string; message?: string };
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.event !== "message" || !m.message) continue;
      const b = open(serverId, key, m.message);
      if (b && (!best || b.at > best.at)) best = b;
    }
    if (best && Date.now() - best.at > TTL_MS) return { ...best, online: false };
    return best;
  } catch {
    return null;
  }
}

/** Keeps the announcement fresh while a server is live on the internet. */
export class BeaconPublisher {
  private timer: NodeJS.Timeout | null = null;
  private current: { serverId: string; key: string; name: string; url: string } | null = null;

  online(serverId: string, key: string, name: string, url: string) {
    this.clear();
    this.current = { serverId, key, name, url };
    const post = () => void publishBeacon(serverId, key, { online: true, url, name });
    post();
    this.timer = setInterval(post, 60 * 60 * 1000); // hourly: stays inside the relay's 12 h cache
  }

  /** Tell friends right away that the server went offline (instead of waiting for the old link to fail). */
  offline() {
    const c = this.current;
    this.clear();
    if (c) void publishBeacon(c.serverId, c.key, { online: false, url: null, name: c.name });
  }

  private clear() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.current = null;
  }
}
