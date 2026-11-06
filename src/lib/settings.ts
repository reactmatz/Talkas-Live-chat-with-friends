import { useSyncExternalStore } from "react";
import type { Profile } from "../../shared/protocol";

export interface PeerAudio {
  volume: number; // 0..1 (voice)
  muted: boolean;
  streamVolume: number; // 0..1
}

export type Language = "en" | "pt-BR";

export interface Settings {
  language: Language;
  profile: Profile;
  // voice & video
  inputDevice: string; // "" = system default
  outputDevice: string;
  cameraDevice: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  isolation: "off" | "standard" | "strong"; // AI noise suppression (RNNoise / GTCRN)
  gate: boolean; // noise gate: closes the mic between words
  gateDb: number;
  defaultPreset: string;
  // sounds
  sounds: { join: boolean; leave: boolean; mute: boolean; message: boolean };
  // appearance
  zoom: number; // 0.8 .. 1.3
  compactChat: boolean;
  hideNonVideo: boolean;
  hideSelfView: boolean; // don't show my own camera in thumbnails (only when expanded)
  // advanced / hosting
  publicStun: boolean;
  // per member (keyed by display name, ids change every session)
  peers: Record<string, PeerAudio>;
}

const KEY = "talkas.settings";
const defaults: Settings = {
  language: typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("pt") ? "pt-BR" : "en",
  profile: { name: "", hue: Math.floor(Math.random() * 360), bio: "", avatar: null, banner: "#1b1e23" },
  inputDevice: "",
  outputDevice: "",
  cameraDevice: "",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  isolation: "standard",
  gate: true,
  gateDb: -50,
  defaultPreset: "1080p60",
  sounds: { join: true, leave: true, mute: true, message: false },
  zoom: 1,
  compactChat: false,
  hideNonVideo: false,
  hideSelfView: false,
  publicStun: true,
  peers: {},
};

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // migrate the old connect-screen storage
    const old = JSON.parse(localStorage.getItem("talkas.connect") ?? "{}");
    return {
      ...defaults,
      ...raw,
      profile: { ...defaults.profile, ...(old.name ? { name: old.name, hue: old.hue ?? defaults.profile.hue } : {}), ...raw.profile },
      sounds: { ...defaults.sounds, ...raw.sounds },
      peers: raw.peers ?? {},
    };
  } catch {
    return defaults;
  }
}

let state = load();
const listeners = new Set<() => void>();

export const settings = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  update(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // storage may be unavailable; settings still apply for this run
    }
    listeners.forEach((l) => l());
  },
  peer(name: string): PeerAudio {
    return state.peers[name] ?? { volume: 1, muted: false, streamVolume: 1 };
  },
  setPeer(name: string, patch: Partial<PeerAudio>) {
    settings.update((s) => ({ peers: { ...s.peers, [name]: { ...settings.peer(name), ...patch } } }));
  },
};

export const useSettings = () => useSyncExternalStore(settings.subscribe, settings.get);
