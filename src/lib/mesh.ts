import type { SignalData } from "../../shared/protocol";
import { preferVideoCodecs, tuneOpus } from "./sdp";

/**
 * Every peer connection carries the same four pre-negotiated slots, in this m-line order.
 * Turning the camera or a screen share on/off is just `sender.replaceTrack()` on the matching slot:
 * no renegotiation, no SDP round-trip, the stream starts on the next frame.
 */
export const SLOTS = ["mic", "camera", "screen", "screenAudio"] as const;
export type Slot = (typeof SLOTS)[number];
const KIND: Record<Slot, "audio" | "video"> = { mic: "audio", camera: "video", screen: "video", screenAudio: "audio" };

export interface ScreenPreset {
  id: string;
  label: string;
  height: number;
  fps: number;
  bitrate: number; // bps per viewer
  hint: "motion" | "detail";
}

export const SCREEN_PRESETS: ScreenPreset[] = [
  { id: "720p60", label: "720p · 60 fps", height: 720, fps: 60, bitrate: 4_000_000, hint: "motion" },
  { id: "1080p60", label: "1080p · 60 fps", height: 1080, fps: 60, bitrate: 8_000_000, hint: "motion" },
  { id: "1440p60", label: "1440p · 60 fps", height: 1440, fps: 60, bitrate: 14_000_000, hint: "motion" },
  { id: "1080p15", label: "1080p · text & code", height: 1080, fps: 15, bitrate: 3_000_000, hint: "detail" },
];

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  offerer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  streams: Record<Slot, MediaStream>;
}

export interface MeshEvents {
  signal(to: string, data: SignalData): void;
  remote(peerId: string, slot: Slot, stream: MediaStream): void;
  connection(peerId: string, state: RTCPeerConnectionState): void;
}

/**
 * Full-mesh WebRTC: one RTCPeerConnection per remote member of the voice room (fine for ~2–8 people;
 * upload grows with each viewer, which is the price of having no media server).
 *
 * Negotiation is deterministic to avoid glare: the peer with the smaller id is the only one that ever
 * sends offers (including ICE restarts). The other side only answers.
 */
export class PeerMesh {
  private peers = new Map<string, Peer>();
  private local: Record<Slot, MediaStreamTrack | null> = { mic: null, camera: null, screen: null, screenAudio: null };
  private screenPreset: ScreenPreset = SCREEN_PRESETS[1];

  constructor(
    private readonly selfId: string,
    private readonly iceServers: RTCIceServer[],
    private readonly events: MeshEvents,
  ) {}

  /** Make the set of connections match the voice room's member list. */
  sync(memberIds: string[]) {
    const wanted = new Set(memberIds.filter((id) => id !== this.selfId));
    for (const id of [...this.peers.keys()]) if (!wanted.has(id)) this.drop(id);
    for (const id of wanted) if (!this.peers.has(id)) this.create(id);
  }

  async setTrack(slot: Slot, track: MediaStreamTrack | null, preset?: ScreenPreset) {
    if (preset) this.screenPreset = preset;
    this.local[slot] = track;
    await Promise.all([...this.peers.values()].map((p) => this.attach(p, slot)));
  }

  async handleSignal(from: string, data: SignalData) {
    const peer = this.peers.get(from) ?? this.create(from);
    const pc = peer.pc;
    if ("restart" in data) {
      if (peer.offerer) pc.restartIce();
      return;
    }
    if ("candidate" in data) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.pendingCandidates.push(data.candidate);
      return;
    }
    const desc = data.description;
    if (desc.type === "offer") {
      if (peer.offerer) return; // never happens with deterministic roles; ignore defensively
      await pc.setRemoteDescription(desc);
      // The offer created our transceivers; put our tracks into them in slot order.
      pc.getTransceivers().forEach((t, i) => {
        if (i >= SLOTS.length) return;
        t.direction = "sendrecv";
        if (KIND[SLOTS[i]] === "video") preferVideoCodecs(t);
      });
      await Promise.all(SLOTS.map((s) => this.attach(peer, s)));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription({ type: "answer", sdp: tuneOpus(answer.sdp ?? "") });
      this.events.signal(from, { description: { type: "answer", sdp: pc.localDescription!.sdp } });
    } else {
      if (!peer.offerer || pc.signalingState !== "have-local-offer") return;
      await pc.setRemoteDescription(desc);
    }
    for (const c of peer.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  }

  /** Outbound stats for the share indicator (fps actually encoded, bitrate). */
  async screenStats(): Promise<{ fps: number; bytes: number } | null> {
    const peer = this.peers.values().next().value as Peer | undefined;
    const sender = peer?.pc.getTransceivers()[2]?.sender;
    if (!sender?.track) return null;
    let fps = 0;
    let bytes = 0;
    (await sender.getStats()).forEach((r) => {
      if (r.type === "outbound-rtp") {
        fps = Math.max(fps, r.framesPerSecond ?? 0);
        bytes += r.bytesSent ?? 0;
      }
    });
    return { fps, bytes };
  }

  close() {
    for (const id of [...this.peers.keys()]) this.drop(id);
  }

  // ------------------------------------------------------------------ internals

  private create(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" });
    const peer: Peer = {
      id,
      pc,
      offerer: this.selfId < id,
      pendingCandidates: [],
      streams: { mic: new MediaStream(), camera: new MediaStream(), screen: new MediaStream(), screenAudio: new MediaStream() },
    };
    this.peers.set(id, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.events.signal(id, { candidate: e.candidate.toJSON() as Extract<SignalData, { candidate: unknown }>["candidate"] });
    };
    pc.ontrack = (e) => {
      const slot = SLOTS[pc.getTransceivers().indexOf(e.transceiver)];
      if (!slot) return;
      const stream = new MediaStream([e.track]); // new object so React re-renders the <video>/<audio>
      peer.streams[slot] = stream;
      this.events.remote(id, slot, stream);
    };
    pc.onconnectionstatechange = () => {
      this.events.connection(id, pc.connectionState);
      if (pc.connectionState === "failed") {
        // Network changed (Wi-Fi roam, VPN): restart ICE without tearing down the call.
        if (peer.offerer) pc.restartIce();
        else this.events.signal(id, { restart: true });
      }
    };

    if (peer.offerer) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription({ type: "offer", sdp: tuneOpus(offer.sdp ?? "") });
          this.events.signal(id, { description: { type: "offer", sdp: pc.localDescription!.sdp } });
        } catch (err) {
          console.warn("[mesh] offer failed", err);
        }
      };
      for (const slot of SLOTS) {
        const t = pc.addTransceiver(KIND[slot], { direction: "sendrecv" });
        if (KIND[slot] === "video") preferVideoCodecs(t);
      }
      void Promise.all(SLOTS.map((s) => this.attach(peer, s)));
    }
    return peer;
  }

  private async attach(peer: Peer, slot: Slot) {
    const t = peer.pc.getTransceivers()[SLOTS.indexOf(slot)];
    if (!t) return; // answerer before the offer arrived: attached when it does
    const track = this.local[slot];
    await t.sender.replaceTrack(track).catch((e) => console.warn("[mesh] replaceTrack", slot, e));
    if (track && (KIND[slot] === "video" || slot === "screenAudio")) await this.tune(t.sender, slot);
  }

  /** Encoder settings: screen keeps its frame rate under pressure; camera is capped to stay light. */
  private async tune(sender: RTCRtpSender, slot: Slot) {
    const params = sender.getParameters() as RTCRtpSendParameters & { degradationPreference?: string };
    if (!params.encodings?.length) params.encodings = [{}];
    const enc = params.encodings[0];
    if (slot === "screenAudio") {
      // Without an explicit cap the browser keeps stream audio at a voice-call bitrate.
      enc.maxBitrate = 256_000;
      enc.priority = "high";
      enc.networkPriority = "high";
    } else if (slot === "screen") {
      const p = this.screenPreset;
      enc.maxBitrate = p.bitrate;
      enc.maxFramerate = p.fps;
      enc.scaleResolutionDownBy = 1;
      enc.priority = "high";
      enc.networkPriority = "high";
      params.degradationPreference = p.hint === "motion" ? "maintain-framerate" : "maintain-resolution";
    } else {
      enc.maxBitrate = 1_500_000;
      enc.maxFramerate = 30;
    }
    await sender.setParameters(params).catch((e) => console.warn("[mesh] setParameters", e));
  }

  private drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = peer.pc.onnegotiationneeded = null;
    peer.pc.close();
    this.peers.delete(id);
    this.events.connection(id, "closed");
  }
}
