import { useEffect, useState, type RefObject } from "react";

const WAKE_EVENTS = ["pointermove", "pointerdown", "wheel", "touchstart"] as const;

/**
 * Mouse-inactivity detector for the call stage.
 * Returns true after `ms` without pointer/keyboard activity inside `target`; any movement wakes it
 * instantly. Disabled (always false) when `enabled` is false — e.g. outside a call or while a menu is open.
 */
export function useIdle(target: RefObject<HTMLElement | null>, ms: number, enabled: boolean) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!enabled || !el) {
      setIdle(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false); // React skips the render when the value doesn't change
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    WAKE_EVENTS.forEach((e) => el.addEventListener(e, wake, { passive: true }));
    window.addEventListener("keydown", wake);
    // Leaving the window counts as idle right away: no stray cursor or toolbar on a second monitor.
    const leave = () => {
      clearTimeout(timer);
      setIdle(true);
    };
    el.addEventListener("pointerleave", leave);
    wake();
    return () => {
      clearTimeout(timer);
      WAKE_EVENTS.forEach((e) => el.removeEventListener(e, wake));
      window.removeEventListener("keydown", wake);
      el.removeEventListener("pointerleave", leave);
    };
  }, [target, ms, enabled]);

  return idle;
}
