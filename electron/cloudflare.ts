import { spawn, execFile, type ChildProcess } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { WebSocket } from "ws";
import { SIGNAL_PATH } from "../shared/protocol";

/**
 * Internet invites through a Cloudflare Quick Tunnel (free, no account, no router setup).
 * `cloudflared tunnel --url http://127.0.0.1:<port>` gives a random https://<words>.trycloudflare.com
 * address that forwards HTTP + WebSocket to the local signaling server. Friends connect to
 * wss://<words>.trycloudflare.com and never see the host's IP. The link changes on every start.
 * Only the handshake goes through it — voice and video still connect peer to peer.
 */
export type TunnelState =
  | { state: "off" }
  | { state: "downloading"; percent: number }
  | { state: "starting" }
  | { state: "on"; url: string }
  | { state: "error"; message: string };

const RELEASES = "https://github.com/cloudflare/cloudflared/releases/latest/download/";

function asset() {
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "386" : "amd64";
  if (process.platform === "win32") return { file: `cloudflared-windows-${arch === "arm64" ? "amd64" : arch}.exe`, tgz: false };
  if (process.platform === "darwin") return { file: `cloudflared-darwin-${arch === "arm64" ? "arm64" : "amd64"}.tgz`, tgz: true };
  return { file: `cloudflared-linux-${arch}`, tgz: false };
}

export class QuickTunnel {
  private child: ChildProcess | null = null;
  private status: TunnelState = { state: "off" };

  constructor(
    private readonly binDir: string,
    private readonly onChange: (s: TunnelState) => void,
  ) {}

  get state() {
    return this.status;
  }

  private set(s: TunnelState) {
    this.status = s;
    this.onChange(s);
  }

  private get exe() {
    return join(this.binDir, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  }

  /** Downloads the official cloudflared binary from Cloudflare's GitHub releases on first use. */
  private async ensureBinary() {
    if (existsSync(this.exe)) return;
    mkdirSync(this.binDir, { recursive: true });
    const { file, tgz } = asset();
    const res = await fetch(RELEASES + file, { redirect: "follow" });
    const final = new URL(res.url);
    if (!res.ok || !res.body || !/(^|\.)github(usercontent)?\.com$/.test(final.hostname)) throw new Error(`Download failed (${res.status}).`);
    const total = Number(res.headers.get("content-length")) || 0;
    let got = 0;
    let last = -1;
    const tmp = join(this.binDir, tgz ? "cloudflared.tgz" : "cloudflared.download");
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, ctl) => {
        got += chunk.byteLength;
        const pct = total ? Math.floor((got / total) * 100) : 0;
        if (pct !== last) this.set({ state: "downloading", percent: (last = pct) });
        ctl.enqueue(chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body.pipeThrough(counter) as never), createWriteStream(tmp));
    if (tgz) {
      await new Promise<void>((ok, fail) => execFile("tar", ["-xzf", tmp, "-C", this.binDir], (e) => (e ? fail(e) : ok())));
      rmSync(tmp, { force: true });
    } else renameSync(tmp, this.exe);
    if (process.platform !== "win32") chmodSync(this.exe, 0o755);
  }

  async start(port: number): Promise<TunnelState> {
    if (this.status.state === "on" || this.status.state === "starting" || this.status.state === "downloading") return this.status;
    try {
      await this.ensureBinary();
    } catch (e) {
      this.set({ state: "error", message: `Couldn't download cloudflared: ${(e as Error).message}` });
      return this.status;
    }
    this.set({ state: "starting" });
    return new Promise((resolve) => {
      const child = spawn(this.exe, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { windowsHide: true });
      this.child = child;
      let settled = false;
      const finish = (s: TunnelState) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.set(s);
        resolve(s);
      };
      const timer = setTimeout(() => {
        this.stop();
        finish({ state: "error", message: "Cloudflare didn't answer in time. Check your internet connection and try again." });
      }, 45_000);
      const scan = (buf: Buffer) => {
        const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(buf.toString());
        if (m) void waitReachable(m[0]).then(() => finish({ state: "on", url: m[0].replace(/^https:/, "wss:") }));
      };
      child.stdout?.on("data", scan);
      child.stderr?.on("data", scan); // cloudflared logs to stderr
      child.on("error", (e) => finish({ state: "error", message: `cloudflared failed to start: ${e.message}` }));
      child.on("exit", (code) => {
        this.child = null;
        if (!settled) finish({ state: "error", message: `cloudflared stopped (code ${code}).` });
        else if (this.status.state === "on") this.set({ state: "error", message: "The internet link closed. Create a new one." });
      });
    });
  }

  stop() {
    const child = this.child;
    this.child = null;
    if (child && !child.killed) child.kill();
    if (this.status.state !== "off") this.set({ state: "off" });
  }
}

/** New quick-tunnel hostnames take a few seconds to propagate: wait until the signaling server answers through it. */
async function waitReachable(httpsUrl: string) {
  const wss = httpsUrl.replace(/^https:/, "wss:");
  for (let i = 0; i < 15; i++) {
    if ((await checkPublicAddress(wss, 5_000)).ok) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** Opens a WebSocket to a public address to prove friends can reach this server. */
export function checkPublicAddress(address: string, timeoutMs = 8000): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(/^wss?:\/\//.test(address.trim()) ? address.trim() : `ws://${address.trim()}`);
      url.pathname = SIGNAL_PATH;
    } catch {
      return resolve({ ok: false, message: "That doesn't look like an address." });
    }
    const ws = new WebSocket(url.toString(), { handshakeTimeout: timeoutMs });
    const done = (ok: boolean, message: string) => {
      ws.removeAllListeners();
      ws.on("error", () => {});
      ws.terminate();
      resolve({ ok, message });
    };
    ws.once("open", () => done(true, "Reachable — friends can join with this link."));
    ws.once("error", (e) => done(false, `Not reachable yet (${(e as NodeJS.ErrnoException).code ?? e.message}).`));
  });
}
