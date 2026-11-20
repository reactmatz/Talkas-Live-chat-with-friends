import { useSyncExternalStore } from "react";

/**
 * Screen shares you chose to watch (member ids). Until you click "Watch stream", someone's share shows blurred and its
 * audio stays silent — like joining a stream on purpose instead of having it play at you.
 */
let ids = new Set<string>();
const listeners = new Set<() => void>();
const emit = (next: Set<string>) => {
  ids = next;
  listeners.forEach((l) => l());
};

export const watching = {
  has: (id: string) => ids.has(id),
  start(id: string) {
    if (!ids.has(id)) emit(new Set(ids).add(id));
  },
  stop(id: string) {
    if (!ids.has(id)) return;
    const next = new Set(ids);
    next.delete(id);
    emit(next);
  },
  /** Forgets shares that ended, so a new share from the same person starts blurred again. */
  keepOnly(live: string[]) {
    const next = new Set([...ids].filter((id) => live.includes(id)));
    if (next.size !== ids.size) emit(next);
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

export const useWatching = () => useSyncExternalStore(watching.subscribe, () => ids);
