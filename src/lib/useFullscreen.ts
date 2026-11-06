import { useCallback, useEffect, useState, type RefObject } from "react";

/** Element fullscreen. In Electron this also makes the window borderless fullscreen (no title bar, no frame). */
export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const on = () => setActive(document.fullscreenElement === target.current && !!target.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [target]);

  const enter = useCallback(() => {
    if (!document.fullscreenElement) void target.current?.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }, [target]);
  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  const toggle = useCallback(() => (document.fullscreenElement ? exit() : enter()), [enter, exit]);
  return { active, enter, exit, toggle };
}
