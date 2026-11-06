import { Copy, Minus, Square, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { native } from "../lib/native";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Avatar({ name, hue, src, size = 32, speaking = false }: { name: string; hue: number; src?: string | null; size?: number; speaking?: boolean }) {
  return (
    <div
      className={cx("flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-fg transition-shadow duration-150", speaking && "ring-2 ring-accent ring-offset-2 ring-offset-panel")}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 45% 38%)` }}
    >
      {src ? <img src={src} alt="" draggable={false} className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  danger = false,
  size = 18,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "flex items-center justify-center rounded-md p-1.5 transition-colors",
        danger ? "text-red hover:bg-red/15" : active ? "bg-elevated text-fg" : "text-fg2 hover:bg-hover hover:text-fg",
        className,
      )}
    >
      <Icon size={size} />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-accent text-canvas hover:bg-accent-soft",
    secondary: "bg-elevated text-fg hover:bg-hover border border-line",
    danger: "bg-red/90 text-fg hover:bg-red",
    ghost: "text-fg2 hover:text-fg hover:bg-hover",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx("inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50", styles, className)}
    >
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 p-6 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-pop flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" style={{ maxWidth: width }}>
        <div className="flex items-center border-b border-line px-5 py-3.5">
          <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Custom title bar for the frameless window, with standard Windows caption buttons. */
export function TitleBar({ title }: { title: string }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!native) return;
    void native.window.isMaximized().then(setMaximized);
    return native.window.onState((s) => setMaximized(s.maximized));
  }, []);
  const btn = "flex h-8 w-[46px] items-center justify-center text-fg2 transition-colors";
  return (
    <div data-drag onDoubleClick={() => native?.window.maximize()} className="flex h-8 shrink-0 items-center bg-canvas pl-3 text-xs font-semibold tracking-wide text-muted">
      <span className="flex-1">{title}</span>
      {native && (
        <div className="flex h-full" onDoubleClick={(e) => e.stopPropagation()}>
          <button aria-label="Minimize" title="Minimize" onClick={() => native!.window.minimize()} className={cx(btn, "hover:bg-hover hover:text-fg")}>
            <Minus size={16} strokeWidth={1.5} />
          </button>
          <button aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore Down" : "Maximize"} onClick={() => native!.window.maximize()} className={cx(btn, "hover:bg-hover hover:text-fg")}>
            {maximized ? <Copy size={13} strokeWidth={1.5} className="-scale-x-100" /> : <Square size={13} strokeWidth={1.5} />}
          </button>
          <button aria-label="Close" title="Close" onClick={() => native!.window.close()} className={cx(btn, "hover:bg-[#c42b1c] hover:text-fg")}>
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
