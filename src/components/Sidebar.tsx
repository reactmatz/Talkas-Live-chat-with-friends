import {
  Camera,
  Hash,
  Headphones,
  HeadphoneOff,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Plus,
  Settings,
  Signal,
  UserPlus,
  Video,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import type { Channel } from "../../shared/protocol";
import type { HostInfo } from "../lib/native";
import { session, useSession } from "../lib/session";
import { MemberMenu, type MenuTarget } from "./MemberMenu";
import { Avatar, IconButton, cx } from "./ui";

/** Far-left rail: the connected server, plus leave/join. */
export function ServerRail({
  onLeave,
  onJoin,
}: {
  onLeave: () => void;
  onJoin: () => void;
}) {
  const s = useSession();
  const name = s.server?.name ?? "";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-canvas py-3">
      {s.server && (
        <>
          <div className="relative">
            <span className="absolute top-1/2 -left-3 h-10 w-1 -translate-y-1/2 rounded-r bg-fg" />
            <div
              title={name}
              className="flex size-12 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-canvas"
            >
              {initials || "T"}
            </div>
          </div>
          <div className="my-1 h-0.5 w-8 rounded bg-line" />
        </>
      )}
      <button
        title="Host or join a server"
        onClick={onJoin}
        className="flex size-12 items-center justify-center rounded-3xl bg-panel text-accent transition-all hover:rounded-2xl hover:bg-accent hover:text-canvas"
      >
        <Plus size={22} />
      </button>
      <div className="flex-1" />
      {s.server && (
        <button
          title="Disconnect"
          onClick={onLeave}
          className="flex size-12 items-center justify-center rounded-3xl bg-panel text-fg2 transition-all hover:rounded-2xl hover:bg-red hover:text-fg"
        >
          <LogOut size={18} />
        </button>
      )}
    </nav>
  );
}

/** Channel list, voice rooms with their members, voice panel and user footer. */
export function ChannelSidebar({
  selected,
  onSelect,
  host,
  onInvite,
  onShare,
  onSettings,
}: {
  selected: string | null;
  onSelect: (c: Channel) => void;
  host: HostInfo | null;
  onInvite: () => void;
  onShare: () => void;
  onSettings: () => void;
}) {
  const s = useSession();
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const me = s.selfId ? s.members[s.selfId] : null;
  const text = s.server?.channels.filter((c) => c.kind === "text") ?? [];
  const voice = s.server?.channels.filter((c) => c.kind === "voice") ?? [];
  const inVoice = s.voiceChannel
    ? s.server?.channels.find((c) => c.id === s.voiceChannel)
    : null;

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <header className="flex h-12 items-center gap-2 border-b border-line px-4 shadow-sm">
        <span className="flex-1 truncate text-[15px] font-semibold">
          {s.server?.name}
        </span>
        {host && (
          <IconButton
            icon={UserPlus}
            label="Invite friends"
            onClick={onInvite}
            size={16}
          />
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <Section title="Text channels">
          {text.map((c) => (
            <ChannelRow
              key={c.id}
              active={selected === c.id}
              onClick={() => onSelect(c)}
              icon={<Hash size={18} className="text-muted" />}
              name={c.name}
            />
          ))}
        </Section>
        <Section title="Voice channels">
          {voice.map((c) => {
            const ids = s.voice[c.id] ?? [];
            return (
              <div key={c.id}>
                <ChannelRow
                  active={selected === c.id}
                  onClick={() => onSelect(c)}
                  icon={<Volume2 size={18} className="text-muted" />}
                  name={c.name}
                />
                <div className="flex flex-col gap-0.5 pb-1 pl-8">
                  {ids.map((id) => {
                    const m = s.members[id];
                    if (!m) return null;
                    return (
                      <div
                        key={id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({
                            x: e.clientX,
                            y: e.clientY,
                            memberId: id,
                            stream: false,
                          });
                        }}
                        className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] text-fg2 hover:bg-hover"
                      >
                        <Avatar
                          name={m.name}
                          hue={m.hue}
                          src={m.avatar}
                          size={22}
                          speaking={!!s.speaking[id] && !m.state.muted}
                        />
                        <span className="flex-1 truncate">{m.name}</span>
                        {m.state.sharing && (
                          <span className="rounded bg-red px-1 text-[9px] font-bold text-fg">
                            LIVE
                          </span>
                        )}
                        {m.state.camera && (
                          <Video size={13} className="text-fg2" />
                        )}
                        {m.state.deafened ? (
                          <HeadphoneOff size={13} className="text-red" />
                        ) : m.state.muted ? (
                          <MicOff size={13} className="text-red" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Section>
      </div>

      {inVoice && (
        <div className="border-t border-line px-2 py-2">
          <div className="flex items-center gap-2 px-1">
            <Signal size={16} className="text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-accent">
                Voice Connected
              </div>
              <div className="truncate text-xs text-muted">
                {inVoice.name} / {s.server?.name}
              </div>
            </div>
            <IconButton
              icon={PhoneOff}
              label="Disconnect"
              onClick={() => session.leaveVoice()}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => void session.toggleCamera()}
              className={cx(
                "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium",
                s.local.camera
                  ? "bg-accent/20 text-accent"
                  : "bg-elevated text-fg2 hover:bg-hover hover:text-fg",
              )}
            >
              <Camera size={15} /> Video
            </button>
            <button
              onClick={() =>
                s.local.sharing ? void session.stopShare() : onShare()
              }
              className={cx(
                "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium",
                s.local.sharing
                  ? "bg-accent/20 text-accent"
                  : "bg-elevated text-fg2 hover:bg-hover hover:text-fg",
              )}
            >
              <MonitorUp size={15} /> {s.local.sharing ? "Stop" : "Screen"}
            </button>
          </div>
        </div>
      )}

      {me && (
        <footer className="flex items-center gap-2 bg-canvas/60 px-2 py-2">
          <Avatar
            name={me.name}
            hue={me.hue}
            src={me.avatar}
            size={32}
            speaking={!!s.speaking[me.id] && !s.local.muted}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{me.name}</div>
            <div className="text-[11px] text-muted">
              {host ? "Hosting" : "Online"}
            </div>
          </div>
          <IconButton
            icon={s.local.muted ? MicOff : Mic}
            label={s.local.muted ? "Unmute" : "Mute"}
            onClick={() => session.toggleMute()}
            className={s.local.muted ? "text-red" : ""}
          />
          <IconButton
            icon={s.local.deafened ? HeadphoneOff : Headphones}
            label={s.local.deafened ? "Undeafen" : "Deafen"}
            onClick={() => session.toggleDeafen()}
            className={s.local.deafened ? "text-red" : ""}
          />
          <IconButton
            icon={Settings}
            label="User Settings"
            onClick={onSettings}
          />
        </footer>
      )}
      {menu && <MemberMenu target={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="px-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function ChannelRow({
  active,
  onClick,
  icon,
  name,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex h-8 items-center gap-1.5 rounded-md px-2 text-left text-[15px] transition-colors",
        active
          ? "bg-elevated text-fg"
          : "text-fg2 hover:bg-hover hover:text-fg",
      )}
    >
      {icon}
      <span className="truncate">{name}</span>
    </button>
  );
}
