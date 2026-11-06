import { Headphones, HeadphoneOff, Maximize, Mic, MicOff, Minimize, MonitorUp, MonitorX, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";
import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Channel } from "../../shared/protocol";
import { session, useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { MemberMenu, type MenuTarget, type TileActions } from "./MemberMenu";
import { PopOut } from "./PopOut";
import { useFullscreen } from "../lib/useFullscreen";
import { useIdle } from "../lib/useIdle";
import { Avatar, Button, cx } from "./ui";

const IDLE_MS = 3_000;

/** Free placement of a tile on the stage, as fractions of the stage size (survives window resizes). */
interface Place {
  x: number;
  y: number;
  w: number;
}
interface TileLayout {
  float?: Place;
  pinned?: boolean; // stays visible when the rest of the UI fades out
}
const LAYOUT_KEY = "talkas.tiles";
// Remembered per person + kind (ids change every session, names don't).
function loadLayouts(): Record<string, TileLayout> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as Record<string, TileLayout>;
  } catch {
    return {};
  }
}
function saveLayouts(v: Record<string, TileLayout>) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(v));
  } catch {
    // storage unavailable: layout just isn't remembered
  }
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Tile {
  key: string;
  memberId: string;
  kind: "user" | "screen";
  stream: MediaStream | null;
  self: boolean;
}

/**
 * Call stage. Immersive behaviour:
 *  - clicking a live screen share focuses it and enters borderless fullscreen;
 *  - after 3 s without mouse/keyboard activity the cursor, the floating toolbar, the participant strip
 *    and the name labels fade out; any movement brings them back instantly.
 */
export function VoiceStage({ channel, onShare, pickerOpen }: { channel: Channel; onShare: () => void; pickerOpen: boolean }) {
  const s = useSession();
  const stage = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(stage);
  const [focus, setFocus] = useState<string | null>(null);
  const [overToolbar, setOverToolbar] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const { hideNonVideo, hideSelfView } = useSettings();
  const [layouts, setLayouts] = useState(loadLayouts);
  const [popped, setPopped] = useState<string[]>([]);
  const inCall = s.voiceChannel === channel.id;
  const idle = useIdle(stage, IDLE_MS, inCall && !pickerOpen && !overToolbar && !menu);

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    for (const id of s.voice[channel.id] ?? []) {
      const m = s.members[id];
      if (!m) continue;
      const self = id === s.selfId;
      const r = s.remote[id];
      out.push({ key: `u-${id}`, memberId: id, kind: "user", self, stream: m.state.camera ? (self ? s.localCamera : (r?.camera ?? null)) : null });
      if (m.state.sharing) out.push({ key: `s-${id}`, memberId: id, kind: "screen", self, stream: self ? s.localScreen : (r?.screen ?? null) });
    }
    // "Hide Non-Video Participants" — only when there is at least one video to show.
    return hideNonVideo && out.some((t) => t.stream) ? out.filter((t) => t.kind === "screen" || t.stream) : out;
  }, [s.voice, s.members, s.remote, s.localCamera, s.localScreen, s.selfId, channel.id, hideNonVideo]);

  const layoutId = useCallback((t: Tile) => `${t.kind}:${s.members[t.memberId]?.name ?? t.memberId}`, [s.members]);
  const layoutOf = (t: Tile) => layouts[layoutId(t)] ?? {};
  const setLayout = (t: Tile, patch: Partial<TileLayout>) =>
    setLayouts((all) => {
      const next = { ...all, [layoutId(t)]: { ...all[layoutId(t)], ...patch } };
      saveLayouts(next);
      return next;
    });

  // Forget pop-outs whose tile is gone (camera off, stream ended, left the call).
  useEffect(() => {
    setPopped((p) => (p.every((k) => tiles.some((t) => t.key === k)) ? p : p.filter((k) => tiles.some((t) => t.key === k))));
  }, [tiles]);

  const [menuTile, setMenuTile] = useState<Tile | null>(null);
  const openMenu = (t: Tile) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuTile(t);
    setMenu({ x: e.clientX, y: e.clientY, memberId: t.memberId, stream: t.kind === "screen" });
  };

  const focused = tiles.find((t) => t.key === focus && !popped.includes(t.key)) ?? null;
  // My own camera is hidden from thumbnails when "Hide my camera for me" is on (still shown when expanded).
  const hiddenSelf = (t: Tile) => hideSelfView && t.self && t.kind === "user";
  const placed = tiles.filter((t) => !popped.includes(t.key));
  const floating = placed.filter((t) => t !== focused && layoutOf(t).float && !hiddenSelf(t));
  const docked = placed.filter((t) => !floating.includes(t));
  const others = (focused ? docked.filter((t) => t !== focused) : docked).filter((t) => !(focused && hiddenSelf(t)));

  // Drop focus (and leave fullscreen) when the focused stream ends.
  useEffect(() => {
    if (focus && !focused) {
      setFocus(null);
      fullscreen.exit();
    }
  }, [focus, focused, fullscreen]);

  // F toggles fullscreen, like most video players.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || (e.target as HTMLElement)?.closest("input, textarea") || !inCall) return;
      fullscreen.toggle();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [fullscreen, inCall]);

  const watch = (t: Tile) => {
    setFocus(t.key);
    if (t.kind === "screen" || t.stream) fullscreen.enter(); // user gesture: allowed to go fullscreen
  };

  if (!inCall)
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-4 bg-void">
        <Volume2 size={40} className="text-muted" />
        <div className="text-xl font-semibold">{channel.name}</div>
        <p className="text-sm text-fg2">{(s.voice[channel.id] ?? []).length ? t("{count} in voice right now.", { count: (s.voice[channel.id] ?? []).length }) : t("No one in voice right now.")}</p>
        <Button variant="primary" onClick={() => void session.joinVoice(channel.id)}>
          {t("Join Voice")}
        </Button>
      </section>
    );

  // Visibility classes: fade out slowly, come back instantly.
  const chrome = idle ? "pointer-events-none opacity-0 duration-500" : "opacity-100 duration-75";

  return (
    <section
      ref={stage}
      className={cx("relative flex min-h-0 flex-1 flex-col bg-void transition-[cursor]", idle && "cursor-none [&_*]:cursor-none", fullscreen.active ? "p-0" : "p-3")}
    >
      {!fullscreen.active && (
        <header className={cx("flex h-9 shrink-0 items-center gap-2 px-1 transition-opacity", chrome)}>
          <Volume2 size={18} className="text-muted" />
          <span className="font-semibold">{channel.name}</span>
          <ShareStats />
        </header>
      )}

      {focused ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <TileView tile={tile(focused)} big fullscreen={fullscreen.active} idle={idle} onClick={() => setFocus(null)} onContextMenu={openMenu(focused)} />
          </div>
          {others.length > 0 && (
            <div className={cx("pointer-events-none flex h-28 shrink-0 justify-center gap-2", fullscreen.active && "absolute inset-x-0 bottom-24 z-10")}>
              {others.map((t) => (
                <div key={t.key} className={cx("pointer-events-auto aspect-video h-full transition-opacity", !layoutOf(t).pinned && chrome)}>
                  <TileView tile={tile(t)} idle={idle} onClick={() => watch(t)} onContextMenu={openMenu(t)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 content-center gap-2" style={{ gridTemplateColumns: `repeat(${cols(docked.length)}, minmax(0, 1fr))` }}>
          {docked.map((t) => (
            <div key={t.key} className="aspect-video max-h-full min-h-0">
              <TileView tile={tile(t)} idle={idle} onClick={() => watch(t)} onContextMenu={openMenu(t)} />
            </div>
          ))}
        </div>
      )}

      {/* Floating tiles: anywhere on the stage, including the middle */}
      {floating.map((t) => (
        <FloatingTile key={t.key} stage={stage} place={layoutOf(t).float!} faded={!layoutOf(t).pinned && idle} onPlace={(float) => setLayout(t, { float })}>
          <TileView tile={tile(t)} idle={idle && !layoutOf(t).pinned} onClick={() => watch(t)} onContextMenu={openMenu(t)} />
        </FloatingTile>
      ))}

      {/* Popped-out tiles: their own OS window (another monitor, for example) */}
      {tiles
        .filter((pt) => popped.includes(pt.key))
        .map((pt) => {
          const v = tile(pt);
          return (
            <PopOut key={pt.key} id={pt.key} title={pt.kind === "screen" ? t("{name}'s screen", { name: v.name }) : `${v.name} — Talkas`} onClosed={() => setPopped((p) => p.filter((k) => k !== pt.key))}>
              <TileView tile={v} big fullscreen idle={false} onClick={() => undefined} onContextMenu={(e) => e.preventDefault()} />
            </PopOut>
          );
        })}

      {menu && (
        <MemberMenu
          target={menu}
          tile={menuTile ? tileActions(menuTile) : undefined}
          onClose={() => {
            setMenu(null);
            setMenuTile(null);
          }}
          onFullscreen={() => {
            setFocus(`s-${menu.memberId}`);
            fullscreen.enter();
          }}
        />
      )}

      {/* Floating control bar */}
      <div
        onPointerEnter={() => setOverToolbar(true)}
        onPointerLeave={() => setOverToolbar(false)}
        className={cx("absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-panel/90 p-2 shadow-2xl backdrop-blur transition-[opacity,transform]", chrome, idle && "translate-y-3")}
      >
        <Ctl on={!s.local.muted} onIcon={Mic} offIcon={MicOff} label={s.local.muted ? t("Unmute") : t("Mute")} onClick={() => session.toggleMute()} />
        <Ctl on={!s.local.deafened} onIcon={Headphones} offIcon={HeadphoneOff} label={s.local.deafened ? t("Undeafen") : t("Deafen")} onClick={() => session.toggleDeafen()} />
        <Ctl on={s.local.camera} onIcon={Video} offIcon={VideoOff} label={s.local.camera ? t("Turn off camera") : t("Turn on camera")} onClick={() => void session.toggleCamera()} neutralOff />
        <Ctl on={s.local.sharing} onIcon={MonitorX} offIcon={MonitorUp} label={s.local.sharing ? t("Stop sharing") : t("Share your screen")} onClick={() => (s.local.sharing ? void session.stopShare() : onShare())} neutralOff accentOn />
        <div className="mx-1 h-7 w-px bg-line" />
        <Ctl on onIcon={fullscreen.active ? Minimize : Maximize} offIcon={Maximize} label={fullscreen.active ? t("Exit fullscreen (F)") : t("Fullscreen (F)")} onClick={fullscreen.toggle} />
        <button title={t("Disconnect")} onClick={() => session.leaveVoice()} className="flex h-11 w-14 items-center justify-center rounded-xl bg-red text-fg transition-colors hover:bg-red/85">
          <PhoneOff size={20} />
        </button>
      </div>
    </section>
  );

  function tileActions(t: Tile): TileActions {
    const l = layoutOf(t);
    return {
      floating: !!l.float,
      pinned: !!l.pinned,
      onFloat: () => setLayout(t, { float: l.float ? undefined : { x: 0.62, y: 0.5, w: 0.3 } }),
      onPin: () => setLayout(t, { pinned: !l.pinned }),
      onPopOut: () => {
        if (focus === t.key) setFocus(null);
        setPopped((p) => (p.includes(t.key) ? p : [...p, t.key]));
      },
    };
  }

  function tile(t: Tile) {
    const m = s.members[t.memberId];
    return { ...t, name: m?.name ?? "?", hue: m?.hue ?? 0, avatar: m?.avatar ?? null, banner: m?.banner ?? null, muted: !!m?.state.muted, speaking: !!s.speaking[t.memberId] && !m?.state.muted };
  }
}

const cols = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);

function TileView({
  tile,
  big = false,
  fullscreen = false,
  idle,
  onClick,
  onContextMenu,
}: {
  tile: Tile & { name: string; hue: number; avatar: string | null; banner: string | null; muted: boolean; speaking: boolean };
  big?: boolean;
  fullscreen?: boolean;
  idle: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const isScreen = tile.kind === "screen";
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={!tile.stream && !isScreen && tile.banner ? { background: tile.banner } : undefined}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const doc = e.currentTarget.ownerDocument; // the main window or a pop-out window
        if (doc.fullscreenElement) void doc.exitFullscreen();
        else ((e.currentTarget.closest("section, [data-pop]") as HTMLElement | null) ?? e.currentTarget).requestFullscreen().catch(() => {});
      }}
      className={cx(
        "group relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden bg-panel transition-shadow",
        fullscreen ? "rounded-none" : "rounded-xl",
        tile.speaking && !isScreen && "ring-2 ring-accent",
      )}
    >
      {tile.stream ? (
        <VideoView stream={tile.stream} mirror={tile.self && !isScreen} contain={isScreen || big} />
      ) : isScreen ? (
        <span className="text-sm text-muted">{t("Connecting to stream…")}</span>
      ) : (
        <Avatar name={tile.name} hue={tile.hue} src={tile.avatar} size={big ? 96 : 72} speaking={tile.speaking} />
      )}
      <Label idle={idle}>
        {isScreen && <span className="rounded bg-red px-1 text-[10px] font-bold">{t("LIVE")}</span>}
        {tile.muted && !isScreen && <MicOff size={13} className="text-red" />}
        <span>{isScreen ? t("{name}'s screen", { name: tile.name }) : tile.name}</span>
      </Label>
      {isScreen && !big && (
        <span className="absolute inset-0 flex items-center justify-center bg-void/40 text-sm font-semibold opacity-0 transition-opacity group-hover:opacity-100">{t("Watch stream")}</span>
      )}
    </div>
  );
}

/** A tile placed freely on the stage: drag to move, corner handle to resize. */
function FloatingTile({ stage, place, faded, onPlace, children }: { stage: React.RefObject<HTMLElement | null>; place: Place; faded: boolean; onPlace: (p: Place) => void; children: ReactNode }) {
  const [live, setLive] = useState<Place | null>(null); // while dragging: local, saved on release
  const moved = useRef(false);
  const p = live ?? place;

  const start = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    moved.current = false;
    const from = { px: e.clientX, py: e.clientY, ...place };
    let cur = place;
    const aspect = box.width / box.height; // tile is 16:9, so its height fraction depends on the stage shape
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - from.px) / box.width;
      const dy = (ev.clientY - from.py) / box.height;
      if (Math.abs(ev.clientX - from.px) + Math.abs(ev.clientY - from.py) > 4) moved.current = true;
      if (mode === "move") {
        const h = ((from.w * aspect) * 9) / 16;
        cur = { w: from.w, x: clamp(from.x + dx, 0, 1 - from.w), y: clamp(from.y + dy, 0, Math.max(0, 1 - h)) };
      } else {
        const w = clamp(from.w + dx, 0.12, 1 - from.x);
        cur = { x: from.x, y: from.y, w };
      }
      setLive(cur);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setLive(null);
      if (moved.current) onPlace({ x: cur.x, y: cur.y, w: cur.w });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div
      onPointerDown={start("move")}
      onClickCapture={(e) => {
        if (moved.current) {
          e.stopPropagation(); // a drag is not a click
          moved.current = false;
        }
      }}
      className={cx("group/float absolute z-10 aspect-video touch-none rounded-xl shadow-2xl transition-opacity", live ? "cursor-grabbing" : "cursor-grab", faded ? "pointer-events-none opacity-0 duration-500" : "opacity-100 duration-75")}
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%` }}
    >
      {children}
      <div
        onPointerDown={start("resize")}
        title={t("Resize")}
        className="absolute right-0 bottom-0 size-4 cursor-nwse-resize rounded-br-xl border-r-2 border-b-2 border-fg/60 opacity-0 transition-opacity group-hover/float:opacity-100"
      />
    </div>
  );
}

function Label({ idle, children }: { idle: boolean; children: ReactNode }) {
  return (
    <div className={cx("absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-void/70 px-2 py-1 text-xs font-medium transition-opacity", idle ? "opacity-0 duration-500" : "opacity-100 duration-75")}>
      {children}
    </div>
  );
}

function VideoView({ stream, mirror, contain }: { stream: MediaStream; mirror: boolean; contain: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    void v.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={ref}
      muted // audio is played by <RemoteAudio>, never by video tiles
      playsInline
      autoPlay
      disablePictureInPicture
      className={cx("h-full w-full", contain ? "object-contain" : "object-cover", mirror && "-scale-x-100")}
    />
  );
}

function Ctl({
  on,
  onIcon: On,
  offIcon: Off,
  label,
  onClick,
  neutralOff = false,
  accentOn = false,
}: {
  on: boolean;
  onIcon: typeof Mic;
  offIcon: typeof Mic;
  label: string;
  onClick: () => void;
  neutralOff?: boolean;
  accentOn?: boolean;
}) {
  const Icon = on ? On : Off;
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx(
        "flex size-11 items-center justify-center rounded-xl transition-colors",
        on && accentOn ? "bg-accent text-canvas hover:bg-accent-soft" : !on && !neutralOff ? "bg-red/15 text-red hover:bg-red/25" : "bg-elevated text-fg hover:bg-hover",
      )}
    >
      <Icon size={20} />
    </button>
  );
}

/** Live encoder numbers while you share: actual fps and bitrate leaving this PC (to the first viewer). */
function ShareStats() {
  const s = useSession();
  const [stats, setStats] = useState<{ fps: number; mbps: number } | null>(null);
  useEffect(() => {
    if (!s.local.sharing) return setStats(null);
    let prev: { bytes: number; at: number } | null = null;
    const id = setInterval(async () => {
      const r = await session.screenStats();
      if (!r) return;
      const now = performance.now();
      if (prev) setStats({ fps: Math.round(r.fps), mbps: ((r.bytes - prev.bytes) * 8) / ((now - prev.at) * 1000) });
      prev = { bytes: r.bytes, at: now };
    }, 1_000);
    return () => clearInterval(id);
  }, [s.local.sharing]);
  if (!stats) return null;
  return (
    <span className="ml-auto rounded-md bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg2">
      sharing · {stats.fps} fps · {stats.mbps.toFixed(1)} Mbps
    </span>
  );
}
