import { execFile, spawn } from "node:child_process";
import { resolveSrv } from "node:dns/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import { SIGNAL_PATH } from "../shared/protocol";

/**
 * playit.gg integration. The playit agent forwards a public TCP address (e.g. name.tun.ply.gg:13157)
 * to the local signaling port, so friends outside your network can reach the handshake server.
 * Voice/video still go peer to peer; only the small signaling socket uses the tunnel.
 */
export interface PlayitStatus {
  installed: boolean;
  running: boolean;
  path: string | null;
}

function candidates() {
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA ?? "";
  return process.platform === "win32"
    ? [join(pf, "playit_gg", "bin", "playit.exe"), join(pf86, "playit_gg", "bin", "playit.exe"), join(local, "playit_gg", "bin", "playit.exe")]
    : ["/usr/local/bin/playit", "/usr/bin/playit", "/opt/playit/playit"];
}

function isRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform === "win32")
      execFile("tasklist", ["/FI", "IMAGENAME eq playit.exe", "/NH"], { windowsHide: true }, (err, out) => resolve(!err && /playit\.exe/i.test(out)));
    else execFile("pgrep", ["-x", "playit"], (err) => resolve(!err));
  });
}

export async function playitStatus(): Promise<PlayitStatus> {
  const path = candidates().find((p) => existsSync(p)) ?? null;
  return { installed: !!path, running: await isRunning(), path };
}

/** Starts the agent in its own window (it shows the claim link on first run). */
export async function startPlayit(): Promise<PlayitStatus> {
  const st = await playitStatus();
  if (st.running || !st.path) return st;
  const child = spawn(st.path, [], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  await new Promise((r) => setTimeout(r, 1500));
  return playitStatus();
}

/**
 * playit "Minecraft Java" tunnels hand out a name without a port (name.tun.ply.gg): the real
 * host:port lives in a DNS SRV record (_minecraft._tcp.<name>), like Minecraft clients look it up.
 * Returns "host:port" when such a record exists, otherwise the address unchanged.
 */
export async function resolveAddress(address: string): Promise<string> {
  const a = address.trim();
  if (/^wss?:\/\//i.test(a) || /:\d+$/.test(a) || !/[a-z]/i.test(a)) return a;
  try {
    const [srv] = await resolveSrv(`_minecraft._tcp.${a}`);
    if (srv) return `${srv.name}:${srv.port}`;
  } catch {
    // no SRV record: fall back to the default port
  }
  return a;
}

/** Opens a WebSocket to the public tunnel address to prove friends can reach this server. */
export async function checkTunnel(address: string, timeoutMs = 10000): Promise<{ ok: boolean; message: string }> {
  address = await resolveAddress(address);
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(/^wss?:\/\//.test(address.trim()) ? address.trim() : `ws://${address.trim()}`);
      url.pathname = SIGNAL_PATH;
    } catch {
      return resolve({ ok: false, message: "That doesn't look like an address (example: name.tun.ply.gg:12345)." });
    }
    const ws = new WebSocket(url.toString(), { handshakeTimeout: timeoutMs });
    const done = (ok: boolean, message: string) => {
      ws.removeAllListeners();
      ws.on("error", () => {});
      ws.terminate();
      resolve({ ok, message });
    };
    ws.once("open", () => done(true, "Reachable — friends can join through this address."));
    ws.once("error", (e) => done(false, `Not reachable (${(e as NodeJS.ErrnoException).code ?? e.message}). Is the playit agent running and the tunnel's local address 127.0.0.1:4646?`));
  });
}
