import { GtcrnWorkletNode, NoiseGateWorkletNode, RnnoiseWorkletNode, loadGtcrn, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
// Worklet code as text and WASM inlined: both load from memory (blob:/data:), so they also work from file:// in the packaged app.
import gtcrnWorklet from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?raw";
import noiseGateWorklet from "@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?raw";
import rnnoiseWorklet from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?raw";
import gtcrnWasm from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?inline";
import rnnoiseWasm from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?inline";
import rnnoiseSimdWasm from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?inline";

/**
 * Voice isolation: mic → AI noise suppression → noise gate → the track we send.
 *  - "standard": RNNoise (light, removes fans, keyboard and mouse clicks well)
 *  - "strong":   GTCRN (newer, heavier network; cleaner on busy backgrounds)
 * The gate closes the mic between words, so short clicks under the threshold are never sent.
 */
export type Isolation = "off" | "standard" | "strong";

export interface VoiceOptions {
  isolation: Isolation;
  gate: boolean;
  gateDb: number; // open threshold, e.g. -50 (more negative = more sensitive)
}

const blobUrl = (code: string) => URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
let wasm: { rnnoise?: Promise<ArrayBuffer>; gtcrn?: Promise<ArrayBuffer> } = {};

export interface ProcessedMic {
  stream: MediaStream;
  dispose(): void;
}

export async function processMic(raw: MediaStream, o: VoiceOptions): Promise<ProcessedMic> {
  if (o.isolation === "off" && !o.gate) return { stream: raw, dispose: () => undefined };

  const ctx = new AudioContext({ sampleRate: 48_000, latencyHint: "interactive" });
  const nodes: AudioNode[] = [];
  const cleanups: (() => void)[] = [];
  let last: AudioNode = ctx.createMediaStreamSource(raw);
  const chain = (n: AudioNode) => {
    last.connect(n);
    nodes.push(n);
    last = n;
  };

  if (o.isolation === "standard") {
    wasm.rnnoise ??= loadRnnoise({ url: rnnoiseWasm, simdUrl: rnnoiseSimdWasm });
    const url = blobUrl(rnnoiseWorklet);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: await wasm.rnnoise });
    cleanups.push(() => node.destroy());
    chain(node);
  } else if (o.isolation === "strong") {
    wasm.gtcrn ??= loadGtcrn({ url: gtcrnWasm });
    const url = blobUrl(gtcrnWorklet);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: await wasm.gtcrn });
    cleanups.push(() => node.destroy());
    chain(node);
  }

  if (o.gate) {
    const url = blobUrl(noiseGateWorklet);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    chain(new NoiseGateWorkletNode(ctx, { openThreshold: o.gateDb, closeThreshold: o.gateDb - 6, holdMs: 250, maxChannels: 1 }));
  }

  const dest = ctx.createMediaStreamDestination();
  last.connect(dest);
  const track = dest.stream.getAudioTracks()[0];
  track.contentHint = "speech";

  return {
    stream: dest.stream,
    dispose() {
      cleanups.forEach((c) => c());
      nodes.forEach((n) => n.disconnect());
      dest.stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

/** If the WASM can't load (very old CPU), fall back so the user can still talk. */
export function resetVoiceCache() {
  wasm = {};
}
