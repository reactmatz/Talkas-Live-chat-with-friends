import { Check, Copy, EyeOff, Expand, ExternalLink, Headphones, LogOut, MonitorUp, Move, PhoneOff, Pin, VideoOff } from "lucide-react";
import { t } from "../lib/i18n";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { session, useSession } from "../lib/session";
import { settings, useSettings } from "../lib/settings";
import { cx } from "./ui";

export interface MenuTarget {
  x: number;
  y: number;
  memberId: string;
  stream: boolean; // opened on a screen-share tile
}

/** What can be done with the tile the menu was opened on (call stage only). */
export interface TileActions {
  floating: boolean;
  pinned: boolean;
  onFloat(): void;
  onPin(): void;
  onPopOut(): void;
}

/**
 * Right-click menu for a participant or a stream (Discord-style).
 * Rendered inside the element that opened it, so it also works on top of a fullscreen stage.
 */
export function MemberMenu({ target, onClose, onFullscreen, tile }: { target: MenuTarget; onClose: () => void; onFullscreen?: () => void; tile?: TileActions }) {
  const s = useSession();
  const st = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  const m = s.members[target.memberId];
  const self = target.memberId === s.selfId;
  const me = s.selfId ? s.members[s.selfId] : null;
  const peer = m ? settings.peer(m.name) : null;
  const inMyRoom = !!s.voiceChannel && (s.voice[s.voiceChannel] ?? []).includes(target.memberId);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.min(target.x, window.innerWidth - r.width - 8), top: Math.min(target.y, window.innerHeight - r.height - 8) });
  }, [target.x, target.y]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  if (!m || !peer) return null;
  const inAnyVoice = Object.values(s.voice).some((ids) => ids.includes(m.id));
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="animate-pop fixed z-[60] w-[280px] rounded-lg border border-line bg-panel p-1.5 text-[14px] shadow-2xl"
      style={pos}
    >
      {!self && inMyRoom && (
        <>
          <Slider label={t("User Volume")} value={peer.volume} onChange={(v) => settings.setPeer(m.name, { volume: v })} />
          <Toggle icon={Headphones} label={t("Mute")} checked={peer.muted} onChange={(v) => settings.setPeer(m.name, { muted: v })} />
          {m.state.sharing && <Slider label={t("Stream Volume")} value={peer.streamVolume} onChange={(v) => settings.setPeer(m.name, { streamVolume: v })} />}
        </>
      )}
      {inMyRoom && <Toggle icon={VideoOff} label={t("Hide Non-Video Participants")} checked={st.hideNonVideo} onChange={(v) => settings.update({ hideNonVideo: v })} />}
      {target.stream && onFullscreen && <Item icon={Expand} label={t("Fullscreen")} onClick={run(onFullscreen)} />}
      {self && s.local.sharing && <Item icon={MonitorUp} label={t("Stop Streaming")} onClick={run(() => void session.stopShare())} />}
      {self && <Toggle icon={EyeOff} label={t("Hide my camera for me")} checked={st.hideSelfView} onChange={(v) => settings.update({ hideSelfView: v })} />}

      {tile && (
        <>
          <Separator />
          <Toggle icon={Pin} label={t("Keep visible when idle")} checked={tile.pinned} onChange={() => tile.onPin()} />
          <Toggle icon={Move} label={t("Free position (drag anywhere)")} checked={tile.floating} onChange={run(tile.onFloat)} />
          <Item icon={ExternalLink} label={t("Open in new window")} onClick={run(tile.onPopOut)} />
        </>
      )}

      <Separator />
      <Item icon={Copy} label={t("Copy Name")} onClick={run(() => void navigator.clipboard.writeText(m.name))} />
      {self && s.voiceChannel && <Item icon={LogOut} label={t("Disconnect")} onClick={run(() => session.leaveVoice())} />}
      {!self && me?.host && inAnyVoice && (
        <>
          <Separator />
          <Item icon={PhoneOff} label={t("Disconnect from Voice")} danger onClick={run(() => session.kickFromVoice(m.id))} />
        </>
      )}
    </div>
  );
}

function Separator() {
  return <div className="mx-1.5 my-1 h-px bg-line" />;
}

function Item({ icon: Icon, label, onClick, danger = false }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={cx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left", danger ? "text-red hover:bg-red/15" : "text-fg hover:bg-hover")}>
      <Icon size={16} className={danger ? "" : "text-fg2"} />
      {label}
    </button>
  );
}

function Toggle({ icon: Icon, label, checked, onChange }: { icon: typeof Copy; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="menuitemcheckbox" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-fg hover:bg-hover">
      <Icon size={16} className="text-fg2" />
      <span className="flex-1">{label}</span>
      <span className={cx("flex size-5 items-center justify-center rounded border", checked ? "border-accent bg-accent text-canvas" : "border-faint")}>{checked && <Check size={14} strokeWidth={3} />}</span>
    </button>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }): ReactNode {
  return (
    <div className="flex flex-col gap-2 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-xs text-fg2">{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="w-full accent-[#10b981]" />
    </div>
  );
}
