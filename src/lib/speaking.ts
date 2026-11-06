/** Voice-activity detection for the green "speaking" ring. One AudioContext, one analyser per stream. */
export class SpeakingMonitor {
  private ctx: AudioContext | null = null;
  private nodes = new Map<string, { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer>; since: number }>();
  private state = new Map<string, boolean>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly onChange: (id: string, speaking: boolean) => void) {}

  set(id: string, stream: MediaStream | null) {
    this.remove(id);
    if (!stream || stream.getAudioTracks().length === 0) return;
    this.ctx ??= new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // not connected to destination: playback is done by <audio> elements
    this.nodes.set(id, { source, analyser, buf: new Float32Array(analyser.fftSize), since: 0 });
    this.timer ??= setInterval(() => this.tick(), 80);
  }

  remove(id: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    n.source.disconnect();
    this.nodes.delete(id);
    if (this.state.get(id)) this.onChange(id, false);
    this.state.delete(id);
  }

  close() {
    for (const id of [...this.nodes.keys()]) this.remove(id);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  private tick() {
    const now = performance.now();
    for (const [id, n] of this.nodes) {
      n.analyser.getFloatTimeDomainData(n.buf);
      let sum = 0;
      for (const v of n.buf) sum += v * v;
      const loud = Math.sqrt(sum / n.buf.length) > 0.015;
      if (loud) n.since = now;
      const speaking = now - n.since < 300; // hold briefly so the ring doesn't flicker between words
      if (this.state.get(id) !== speaking) {
        this.state.set(id, speaking);
        this.onChange(id, speaking);
      }
    }
  }
}
