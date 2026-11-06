import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders its children in a separate OS window (window.open + portal), so a camera or a stream can be
 * dragged to another monitor. Same renderer process: the MediaStream plays there with no extra cost.
 * Closing the window calls onClosed; unmounting closes the window.
 */
export function PopOut({ id, title, onClosed, children }: { id: string; title: string; onClosed: () => void; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  useEffect(() => {
    const w = window.open("", `talkas-pop-${id}`, "width=640,height=360");
    if (!w) {
      closedRef.current();
      return;
    }
    const doc = w.document;
    doc.title = title;
    // Same look as the app: relative URLs resolve against the app, and every stylesheet is copied in.
    const base = doc.createElement("base");
    base.href = document.baseURI;
    doc.head.appendChild(base);
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = doc.createElement("style");
        style.textContent = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join("\n");
        doc.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = doc.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          doc.head.appendChild(link);
        }
      }
    }
    doc.body.className = "m-0 h-screen overflow-hidden bg-void text-fg";
    const root = doc.createElement("div");
    root.className = "h-full w-full";
    root.dataset.pop = "";
    doc.body.appendChild(root);
    setHost(root);

    let gone = false;
    const onUnload = () => {
      if (gone) return;
      gone = true;
      setHost(null);
      closedRef.current();
    };
    w.addEventListener("pagehide", onUnload);
    return () => {
      gone = true;
      w.removeEventListener("pagehide", onUnload);
      w.close();
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- title only seeds the window

  return host ? createPortal(children, host) : null;
}
