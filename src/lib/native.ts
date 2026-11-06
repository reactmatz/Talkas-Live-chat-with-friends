/** Bridge exposed by electron/preload.ts. Undefined when the UI runs in a plain browser (dev preview). */
export interface ScreenSource {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnail: string;
  icon: string | null;
}

import type { Channel } from "../../shared/protocol";

export interface SavedServer {
  id: string;
  name: string;
  channels: Channel[];
  createdAt: number;
}

export interface HostInfo {
  running: boolean;
  serverId: string;
  name: string;
  port: number;
  inviteKey: string;
  hostToken: string;
  addresses: string[];
}

export type TunnelState =
  | { state: "off" }
  | { state: "downloading"; percent: number }
  | { state: "starting" }
  | { state: "on"; url: string }
  | { state: "error"; message: string };

export type UpdateState =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "none"; version: string }
  | { state: "available"; version: string; next: string }
  | { state: "downloading"; version: string; next: string; percent: number }
  | { state: "ready"; version: string; next: string }
  | { state: "error"; version: string; message: string };

interface NativeApi {
  platform: string;
  host: { start(serverId: string, port?: number): Promise<HostInfo>; stop(): Promise<void>; info(): Promise<HostInfo> };
  servers: {
    list(): Promise<SavedServer[]>;
    create(name: string): Promise<SavedServer>;
    update(id: string, patch: { name?: string; channels?: Channel[] }): Promise<SavedServer>;
    delete(id: string): Promise<void>;
  };
  tunnel: {
    state(): Promise<TunnelState>;
    start(): Promise<TunnelState>;
    stop(): Promise<void>;
    check(address: string): Promise<{ ok: boolean; message: string }>;
    onState(cb: (s: TunnelState) => void): () => void;
  };
  screen: { sources(): Promise<ScreenSource[]>; select(id: string, audio: boolean): Promise<void> };
  update: { state(): Promise<UpdateState>; check(): Promise<UpdateState>; download(): Promise<void>; install(): void; onState(cb: (s: UpdateState) => void): () => void };
  window: { minimize(): void; maximize(): void; close(): void; isMaximized(): Promise<boolean>; onState(cb: (s: { maximized: boolean }) => void): () => void };
}

declare global {
  interface Window {
    talkas?: NativeApi;
  }
}

export const native = window.talkas;
export const isDesktop = !!native;
