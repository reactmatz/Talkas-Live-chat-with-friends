import { useSyncExternalStore } from "react";
import { DEFAULT_PORT, NO_MEDIA, type ChatMessage, type MediaState, type Member, type ServerInfo } from "../../shared/protocol";
import { PeerMesh, type ScreenPreset, type Slot } from "./mesh";
import { native } from "./native";
import { SignalingClient, type SocketStatus } from "./signaling";
import { SpeakingMonitor } from "./speaking";

export interface RemoteMedia {
  mic?: MediaStream;
  camera?: MediaStream;
  screen?: MediaStream;
  screenAudio?: MediaStream;
  connection?: RTCPeerConnectionState;
}

export interface SessionState {
  status: SocketStatus | "idle";
  error: string | null;
  selfId: string | null;
  server: ServerInfo | null;
  members: Record<string, Member>;
  voice: Record<string, string[]>;
  history: Record<string, ChatMessage[]>;
  voiceChannel: string | null;
  local: MediaState;
  localCamera: MediaStream | null;
  localScreen: MediaStream | null;
  remote: Record<string, RemoteMedia>;
  speaking: Record<string, boolean>;
}

export interface ConnectOptions {
  address: string;
  key: string;
  name: string;
  hue: number;
  publicStun: boolean;
}

const initial: SessionState = {
  status: "idle",
  error: null,
  selfId: null,
  server: null,
  members: {},
  voice: {},
  history: {},
  voiceChannel: null,
  local: { ...NO_MEDIA },
  localCamera: null,
  localScreen: null,
  remote: {},
  speaking: {},
};

/**
 * Client-side session: signaling socket + WebRTC mesh + local devices, exposed to React as an external store.
 */
class Session {
  private state: SessionState = initial;
  private listeners = new Set<() => void>();
  private client: SignalingClient | null = null;
  private mesh: PeerMesh | null = null;
  private mic: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [];
  private speakingMonitor = new SpeakingMonitor((id, on) => this.set({ speaking: { ...this.state.speaking, [id]: on } }));

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  get = () => this.state;

  // ------------------------------------------------------------------ connection

  connect(o: ConnectOptions) {
    this.disconnect();
    // STUN only discovers each peer's public address for NAT traversal; no media goes through it.
    this.iceServers = o.publicStun ? [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }] : [];
    let url: string;
    try {
      url = SignalingClient.normalize(o.address, DEFAULT_PORT);
    } catch {
      this.set({ error: "That address doesn't look right. Use something like 192.168.0.10:4646." });
      return;
    }
    const client = new SignalingClient(url, { t: "hello", key: o.key, name: o.name, hue: o.hue });
    this.client = client;
    this.set({ ...initial, status: "connecting" });
    client.onStatus((status) => {
      if (status !== "open") this.teardownMedia(false);
      this.set({ status });
    });
    client.on((m) => {
      switch (m.t) {
        case "welcome":
          this.mesh?.close();
          this.mesh = new PeerMesh(m.selfId, this.iceServers, {
            signal: (to, data) => this.client?.send({ t: "signal", to, data }),
            remote: (id, slot, stream) => this.onRemote(id, slot, stream),
            connection: (id, state) => this.patchRemote(id, { connection: state }),
          });
          this.set({
            error: null,
            selfId: m.selfId,
            server: m.server,
            members: Object.fromEntries(m.members.map((x) => [x.id, x])),
            voice: m.voice,
            history: m.history,
            voiceChannel: null,
            remote: {},
          });
          return;
        case "member_join":
          this.set({ members: { ...this.state.members, [m.member.id]: m.member } });
          return;
        case "member_leave": {
          const { [m.id]: _gone, ...members } = this.state.members;
          const { [m.id]: _media, ...remote } = this.state.remote;
          this.speakingMonitor.remove(m.id);
          this.set({ members, remote });
          return;
        }
        case "member_state": {
          const member = this.state.members[m.id];
          if (member) this.set({ members: { ...this.state.members, [m.id]: { ...member, state: m.state } } });
          return;
        }
        case "voice":
          this.set({ voice: m.voice });
          this.syncMesh();
          return;
        case "signal":
          void this.mesh?.handleSignal(m.from, m.data).catch((e) => console.warn("[signal]", e));
          return;
        case "chat": {
          const list = [...(this.state.history[m.message.channelId] ?? []), m.message];
          this.set({ history: { ...this.state.history, [m.message.channelId]: list } });
          return;
        }
        case "error":
          this.set({ error: m.message });
          return;
      }
    });
    client.connect();
  }

  disconnect() {
    this.teardownMedia(true);
    this.client?.close();
    this.client = null;
    this.state = initial;
    this.emit();
  }

  // ------------------------------------------------------------------ voice

  async joinVoice(channelId: string) {
    if (this.state.voiceChannel === channelId) return;
    try {
      this.mic ??= await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48_000 },
      });
    } catch {
      this.set({ error: "Microphone blocked or not found. You joined listen-only." });
    }
    const micTrack = this.mic?.getAudioTracks()[0] ?? null;
    if (micTrack) {
      micTrack.contentHint = "speech";
      micTrack.enabled = !this.state.local.muted;
    }
    await this.mesh?.setTrack("mic", micTrack);
    if (this.state.selfId) this.speakingMonitor.set(this.state.selfId, this.mic);
    this.set({ voiceChannel: channelId });
    this.client?.send({ t: "join_voice", channelId });
  }

  leaveVoice() {
    this.client?.send({ t: "leave_voice" });
    this.teardownMedia(true);
    this.set({ voiceChannel: null, remote: {} });
  }

  toggleMute() {
    const muted = !this.state.local.muted;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted)); // sender stays; DTX sends almost nothing
    this.setLocal({ muted, deafened: muted ? this.state.local.deafened : false });
  }

  toggleDeafen() {
    const deafened = !this.state.local.deafened;
    const muted = deafened ? true : this.state.local.muted;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.setLocal({ deafened, muted }); // <audio> elements read `deafened` and mute themselves
  }

  async toggleCamera() {
    if (this.state.localCamera) {
      this.state.localCamera.getTracks().forEach((t) => t.stop());
      await this.mesh?.setTrack("camera", null);
      this.set({ localCamera: null });
      this.setLocal({ camera: false });
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      const track = cam.getVideoTracks()[0];
      track.contentHint = "motion";
      await this.mesh?.setTrack("camera", track);
      this.set({ localCamera: cam });
      this.setLocal({ camera: true });
    } catch {
      this.set({ error: "Camera blocked or not found." });
    }
  }

  async startShare(sourceId: string | null, preset: ScreenPreset, withAudio: boolean) {
    await this.stopShare();
    try {
      if (native && sourceId) await native.screen.select(sourceId, withAudio);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: preset.fps, max: preset.fps }, height: { ideal: preset.height, max: preset.height } },
        audio: withAudio,
      });
      const video = stream.getVideoTracks()[0];
      video.contentHint = preset.hint; // "motion" favors fps, "detail" favors sharp text
      await video.applyConstraints({ frameRate: { ideal: preset.fps, max: preset.fps }, height: { max: preset.height } }).catch(() => {});
      video.addEventListener("ended", () => void this.stopShare()); // stopped from the OS / window closed
      await this.mesh?.setTrack("screen", video, preset);
      await this.mesh?.setTrack("screenAudio", stream.getAudioTracks()[0] ?? null);
      this.set({ localScreen: stream });
      this.setLocal({ sharing: true });
    } catch (e) {
      if ((e as DOMException)?.name !== "NotAllowedError") this.set({ error: "Couldn't start screen sharing." });
    }
  }

  async stopShare() {
    if (!this.state.localScreen) return;
    this.state.localScreen.getTracks().forEach((t) => t.stop());
    await this.mesh?.setTrack("screen", null);
    await this.mesh?.setTrack("screenAudio", null);
    this.set({ localScreen: null });
    this.setLocal({ sharing: false });
  }

  screenStats() {
    return this.mesh?.screenStats() ?? Promise.resolve(null);
  }

  // ------------------------------------------------------------------ chat

  sendChat(channelId: string, text: string) {
    if (text.trim()) this.client?.send({ t: "chat", channelId, text });
  }

  clearError() {
    this.set({ error: null });
  }

  // ------------------------------------------------------------------ internals

  private syncMesh() {
    const ch = this.state.voiceChannel;
    const ids = ch ? (this.state.voice[ch] ?? []) : [];
    // Only connect once the server confirms we're in the room (avoids offers to people who can't relay back).
    this.mesh?.sync(this.state.selfId && ids.includes(this.state.selfId) ? ids : []);
  }

  private onRemote(id: string, slot: Slot, stream: MediaStream) {
    this.patchRemote(id, { [slot]: stream });
    if (slot === "mic") this.speakingMonitor.set(id, stream);
  }

  private patchRemote(id: string, patch: Partial<RemoteMedia>) {
    if (patch.connection === "closed") {
      const { [id]: _gone, ...rest } = this.state.remote;
      this.speakingMonitor.remove(id);
      this.set({ remote: rest });
      return;
    }
    this.set({ remote: { ...this.state.remote, [id]: { ...this.state.remote[id], ...patch } } });
  }

  private setLocal(patch: Partial<MediaState>) {
    const local = { ...this.state.local, ...patch };
    this.set({ local });
    this.client?.send({ t: "state", state: local });
  }

  private teardownMedia(stopMic: boolean) {
    this.mesh?.sync([]);
    this.state.localScreen?.getTracks().forEach((t) => t.stop());
    this.state.localCamera?.getTracks().forEach((t) => t.stop());
    if (stopMic) {
      this.mic?.getTracks().forEach((t) => t.stop());
      this.mic = null;
    }
    this.speakingMonitor.close();
    this.speakingMonitor = new SpeakingMonitor((id, on) => this.set({ speaking: { ...this.state.speaking, [id]: on } }));
    this.state = { ...this.state, localScreen: null, localCamera: null, local: { ...this.state.local, camera: false, sharing: false }, speaking: {} };
  }

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const session = new Session();
export const useSession = () => useSyncExternalStore(session.subscribe, session.get);
