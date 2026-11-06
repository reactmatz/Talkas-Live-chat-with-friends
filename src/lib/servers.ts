import { useSyncExternalStore } from "react";
import type { Channel } from "../../shared/protocol";
import { t } from "./i18n";
import { native, type HostInfo, type SavedServer } from "./native";
import { session } from "./session";
import { settings } from "./settings";

interface State {
  list: SavedServer[];
  host: HostInfo | null; // the saved server currently live from this PC
}

let state: State = { list: [], host: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

/** Servers you own: saved on this PC; "Go live" hosts one of them. */
export const servers = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  async refresh() {
    if (native) set({ list: await native.servers.list() });
  },
  async create(name: string) {
    const s = await native!.servers.create(name);
    await servers.refresh();
    return s;
  },
  async update(id: string, patch: { name?: string; channels?: Channel[] }) {
    await native!.servers.update(id, patch);
    await servers.refresh();
  },
  async remove(id: string) {
    if (state.host?.serverId === id) servers.goOffline();
    await native!.servers.delete(id);
    await servers.refresh();
  },
  async goLive(id: string) {
    const info = await native!.host.start(id);
    set({ host: info });
    const st = settings.get();
    session.connect({ address: `127.0.0.1:${info.port}`, key: info.inviteKey, hostToken: info.hostToken, profile: st.profile, publicStun: st.publicStun });
    return info;
  },
  goOffline() {
    session.disconnect();
    void native?.host.stop();
    set({ host: null });
  },
  errorText(e: unknown) {
    return String((e as Error)?.message ?? e).includes("EADDRINUSE") ? t("Port 4646 is already in use.") : t("Couldn't start the server.");
  },
};

void servers.refresh();
export const useServers = () => useSyncExternalStore(servers.subscribe, servers.get);
