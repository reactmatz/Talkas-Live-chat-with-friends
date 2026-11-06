/** Bridge exposed by electron/preload.ts. Undefined when the UI runs in a plain browser (dev preview). */
export interface ScreenSource {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnail: string;
  icon: string | null;
}

export interface HostInfo {
  running: boolean;
  name: string;
  port: number;
  inviteKey: string;
  addresses: string[];
}

interface NativeApi {
  platform: string;
  host: { start(name: string, port?: number): Promise<HostInfo>; stop(): Promise<void>; info(): Promise<HostInfo> };
  screen: { sources(): Promise<ScreenSource[]>; select(id: string, audio: boolean): Promise<void> };
  window: { minimize(): void; maximize(): void; close(): void; onState(cb: (s: { maximized: boolean }) => void): () => void };
}

declare global {
  interface Window {
    talkas?: NativeApi;
  }
}

export const native = window.talkas;
export const isDesktop = !!native;
