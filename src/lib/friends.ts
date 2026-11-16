import { useSyncExternalStore } from "react";
import { native, type Beacon } from "./native";
import { servers } from "./servers";
import { session } from "./session";
import { settings } from "./settings";

/**
 * Friends' servers you joined at least once. They stay in the server list while the friend is offline;
 * when the friend goes live again, Talkas finds the new internet link by itself (electron/beacon.ts),
 * so nobody has to send a new invite.
 */
export interface FriendServer {
  id: string; // the server's id (from its welcome message)
  name: string;
  key: string; // invite code
  address: string; // last address that worked (a LAN address keeps working on the same Wi-Fi)
  joinedAt: number;
}

export type FriendStatus = { state: "checking" } | { state: "online"; url: string | null } | { state: "offline" } | { state: "unknown" };

const STORE = "talkas.friends";
const POLL_MS = 90_000; // a gentle pace for the free relay

interface State {
  list: FriendServer[];
  status: Record<string, FriendStatus>;
}

function load(): FriendServer[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(raw) ? raw.filter((f) => f && typeof f.id === "string" && typeof f.key === "string") : [];
  } catch {
    return [];
  }
}

let state: State = { list: load(), status: {} };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const persist = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(state.list));
  } catch {
    // storage unavailable: the list just won't survive a restart
  }
};

let pending: { address: string; key: string } | null = null; // what we're connecting with, until the welcome

const setStatus = (id: string, s: FriendStatus) => set({ status: { ...state.status, [id]: s } });

export const friends = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  /** Call right before session.connect() to a friend's server, so the server can be saved once it welcomes us. */
  connecting(address: string, key: string) {
    pending = { address, key };
  },

  /** Saves (or refreshes) the friend's server we just joined. */
  joined(server: { id: string; name: string }) {
    if (!pending) return;
    const prev = state.list.find((f) => f.id === server.id);
    const entry: FriendServer = { id: server.id, name: server.name, key: pending.key.toUpperCase(), address: pending.address, joinedAt: prev?.joinedAt ?? Date.now() };
    pending = null;
    set({ list: prev ? state.list.map((f) => (f.id === server.id ? entry : f)) : [...state.list, entry] });
    persist();
    setStatus(server.id, { state: "online", url: null });
  },

  remove(id: string) {
    const { [id]: _gone, ...status } = state.status;
    set({ list: state.list.filter((f) => f.id !== id), status });
    persist();
  },

  /** Asks the relay whether the friend is live (and where). */
  async check(id: string): Promise<FriendStatus> {
    const f = state.list.find((x) => x.id === id);
    if (!f || !native?.beacon) return { state: "unknown" };
    if (!state.status[id]) setStatus(id, { state: "checking" });
    const b: Beacon | null = await native.beacon.lookup(f.id, f.key).catch(() => null);
    const s: FriendStatus = !b ? { state: "unknown" } : b.online ? { state: "online", url: b.url } : { state: "offline" };
    // A renamed server shows its new name even before you join.
    if (b?.name && b.name !== f.name) {
      set({ list: state.list.map((x) => (x.id === id ? { ...x, name: b.name } : x)) });
      persist();
    }
    setStatus(id, s);
    return s;
  },

  checkAll() {
    for (const f of state.list) void friends.check(f.id);
  },

  /** Joins the friend's server at its current internet link, or the last address that worked. */
  async join(id: string) {
    const f = state.list.find((x) => x.id === id);
    if (!f) return;
    const s = await friends.check(id);
    const address = s.state === "online" && s.url ? s.url : f.address;
    const st = settings.get();
    if (servers.get().host) servers.goOffline(); // one server at a time: stop hosting yours
    friends.connecting(address, f.key);
    session.connect({ address, key: f.key, profile: st.profile, publicStun: st.publicStun });
  },
};

if (native?.beacon) {
  setTimeout(() => friends.checkAll(), 1_000);
  setInterval(() => friends.checkAll(), POLL_MS);
}

export const useFriends = () => useSyncExternalStore(friends.subscribe, friends.get);
