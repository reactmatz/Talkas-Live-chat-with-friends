import { Headphones, HeadphoneOff, Maximize, Mic, MicOff, Minimize, MonitorUp, MonitorX, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Channel } from "../../shared/protocol";
import { session, useSession } from "../lib/session";
import { useFullscreen } from "../lib/useFullscreen";
import { useIdle } from "../lib/useIdle";
import { Avatar, Button, cx } from "./ui";

const IDLE_MS = 3_000;

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
  const inCall = s.voiceChannel === channel.id;
  const idle = useIdle(stage, IDLE_MS, inCall && !pickerOpen && !overToolbar);

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
    return out;
  }, [s.voice, s.members, s.remote, s.localCamera, s.localScreen, s.selfId, channel.id]);

  const focused = tiles.find((t) => t.key === focus) ?? null;
  const others = focused ? tiles.filter((t) => t !== focused) : tiles;

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
        <p className="text-sm text-fg2">{(s.voice[channel.id] ?? []).length || "No one"} in voice right now.</p>
        <Button variant="primary" onClick={() => void session.joinVoice(channel.id)}>
          Join Voice
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
            <TileView tile={tile(focused)} big fullscreen={fullscreen.active} idle={idle} onClick={() => setFocus(null)} />
          </div>
          {others.length > 0 && (
            <div className={cx("flex h-28 shrink-0 justify-center gap-2 transition-opacity", fullscreen.active && "absolute inset-x-0 bottom-24 z-10", chrome)}>
              {others.map((t) => (
                <div key={t.key} className="aspect-video h-full">
                  <TileView tile={tile(t)} idle={idle} onClick={() => watch(t)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 content-center gap-2" style={{ gridTemplateColumns: `repeat(${cols(tiles.length)}, minmax(0, 1fr))` }}>
          {tiles.map((t) => (
            <div key={t.key} className="aspect-video max-h-full min-h-0">
              <TileView tile={tile(t)} idle={idle} onClick={() => watch(t)} />
            </div>
          ))}
        </div>
      )}

      {/* Floating control bar */}
      <div
        onPointerEnter={() => setOverToolbar(true)}
        onPointerLeave={() => setOverToolbar(false)}
        className={cx("absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-panel/90 p-2 shadow-2xl backdrop-blur transition-[opacity,transform]", chrome, idle && "translate-y-3")}
      >
        <Ctl on={!s.local.muted} onIcon={Mic} offIcon={MicOff} label={s.local.muted ? "Unmute" : "Mute"} onClick={() => session.toggleMute()} />
        <Ctl on={!s.local.deafened} onIcon={Headphones} offIcon={HeadphoneOff} label={s.local.deafened ? "Undeafen" : "Deafen"} onClick={() => session.toggleDeafen()} />
        <Ctl on={s.local.camera} onIcon={Video} offIcon={VideoOff} label={s.local.camera ? "Turn off camera" : "Turn on camera"} onClick={() => void session.toggleCamera()} neutralOff />
        <Ctl on={s.local.sharing} onIcon={MonitorX} offIcon={MonitorUp} label={s.local.sharing ? "Stop sharing" : "Share your screen"} onClick={() => (s.local.sharing ? void session.stopShare() : onShare())} neutralOff accentOn />
        <div className="mx-1 h-7 w-px bg-line" />
        <Ctl on onIcon={fullscreen.active ? Minimize : Maximize} offIcon={Maximize} label={fullscreen.active ? "Exit fullscreen (F)" : "Fullscreen (F)"} onClick={fullscreen.toggle} />
        <button title="Disconnect" onClick={() => session.leaveVoice()} className="flex h-11 w-14 items-center justify-center rounded-xl bg-red text-fg transition-colors hover:bg-red/85">
          <PhoneOff size={20} />
        </button>
      </div>
    </section>
  );

  function tile(t: Tile) {
    const m = s.members[t.memberId];
    return { ...t, name: m?.name ?? "?", hue: m?.hue ?? 0, muted: !!m?.state.muted, speaking: !!s.speaking[t.memberId] && !m?.state.muted };
  }
}

const cols = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);

function TileView({
  tile,
  big = false,
  fullscreen = false,
  idle,
  onClick,
}: {
  tile: Tile & { name: string; hue: number; muted: boolean; speaking: boolean };
  big?: boolean;
  fullscreen?: boolean;
  idle: boolean;
  onClick: () => void;
}) {
  const isScreen = tile.kind === "screen";
  return (
    <div
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (document.fullscreenElement) void document.exitFullscreen();
        else (e.currentTarget.closest("section") as HTMLElement | null)?.requestFullscreen().catch(() => {});
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
        <span className="text-sm text-muted">Connecting to stream…</span>
      ) : (
        <Avatar name={tile.name} hue={tile.hue} size={big ? 96 : 72} speaking={tile.speaking} />
      )}
      <Label idle={idle}>
        {isScreen && <span className="rounded bg-red px-1 text-[10px] font-bold">LIVE</span>}
        {tile.muted && !isScreen && <MicOff size={13} className="text-red" />}
        <span>{isScreen ? `${tile.name}'s screen` : tile.name}</span>
      </Label>
      {isScreen && !big && (
        <span className="absolute inset-0 flex items-center justify-center bg-void/40 text-sm font-semibold opacity-0 transition-opacity group-hover:opacity-100">Watch stream</span>
      )}
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
