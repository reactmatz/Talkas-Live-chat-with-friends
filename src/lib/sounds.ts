import { settings } from "./settings";

/** Tiny synthesized UI cues (no audio files): two short sine notes with a soft envelope. */
let ctx: AudioContext | null = null;

function play(notes: [number, number][], gain = 0.08) {
  try {
    ctx ??= new AudioContext();
    let t = ctx.currentTime;
    for (const [freq, dur] of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.8;
    }
  } catch {
    // audio not available
  }
}

export const sounds = {
  join: () => settings.get().sounds.join && play([[660, 0.09], [990, 0.14]]),
  leave: () => settings.get().sounds.leave && play([[880, 0.09], [520, 0.16]]),
  mute: (muted: boolean) => settings.get().sounds.mute && play(muted ? [[520, 0.08]] : [[780, 0.08]], 0.06),
  message: () => settings.get().sounds.message && play([[1040, 0.07], [1320, 0.1]], 0.05),
  test: () => play([[660, 0.09], [990, 0.14]]),
};
