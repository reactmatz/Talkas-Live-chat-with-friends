import { useEffect, useState, type RefObject } from "react";

const WAKE_EVENTS = ["pointermove", "pointerdown", "wheel", "touchstart"] as const;

/**
 * Mouse-inactivity detector for the call stage.
 * Returns true after `ms` without pointer activity inside `target`; any movement wakes it instantly.
 * The keyboard does not wake it, so a screenshot shortcut (Print Screen, Win+Shift+S) captures a clean stage. Disabled (always false) when `enabled` is false — e.g. outside a call or while a menu is open.
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
      el.removeEventListener("pointerleave", leave);
    };
  }, [target, ms, enabled]);

  return idle;
}
