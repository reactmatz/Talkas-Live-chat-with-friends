import { SIGNAL_PATH, type ClientMessage, type ServerMessage } from "../../shared/protocol";

export type SocketStatus = "connecting" | "open" | "closed";

/**
 * WebSocket client for the host's signaling server. Reconnects with backoff;
 * every (re)connection starts with a fresh `hello`, and the server answers with `welcome`.
 */
export class SignalingClient {
  status: SocketStatus = "connecting";
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMessage) => void>();
  private statusListeners = new Set<(s: SocketStatus) => void>();
  private retry = 0;
  private closedByUser = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly address: string,
    private readonly hello: Extract<ClientMessage, { t: "hello" }>,
  ) {}

  /** Accepts "192.168.0.10", "192.168.0.10:4646", "ws://host:port" or "wss://tunnel.example". */
  static normalize(address: string, defaultPort: number) {
    let a = address.trim();
    if (!/^wss?:\/\//.test(a)) a = `ws://${a}`;
    const url = new URL(a);
    if (!url.port && url.protocol === "ws:") url.port = String(defaultPort);
    url.pathname = SIGNAL_PATH;
    return url.toString();
  }

  connect() {
    this.closedByUser = false;
    this.setStatus("connecting");
    const ws = new WebSocket(this.address);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify(this.hello));
      this.setStatus("open");
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.listeners.forEach((l) => l(msg));
    };
    ws.onclose = (e) => {
      this.ws = null;
      this.setStatus("closed");
      if (this.closedByUser || e.code === 4003) return; // 4003 = wrong invite key: don't hammer
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  on(fn: (m: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  onStatus(fn: (s: SocketStatus) => void) {
    this.statusListeners.add(fn);
    return () => void this.statusListeners.delete(fn);
  }

  close() {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close(1000);
    this.ws = null;
  }

  private setStatus(s: SocketStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }
}
