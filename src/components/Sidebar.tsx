import {
  Camera,
  ChevronDown,
  Hash,
  Headphones,
  HeadphoneOff,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  Pencil,
  PhoneOff,
  Plus,
  Settings,
  Signal,
  Trash2,
  UserPlus,
  Video,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Channel, ChannelKind, ServerInfo } from "../../shared/protocol";
import { useT } from "../lib/i18n";
import type { SavedServer } from "../lib/native";
import { servers, useServers } from "../lib/servers";
import { session, useSession } from "../lib/session";
import { MemberMenu, type MenuTarget } from "./MemberMenu";
import { Avatar, Button, IconButton, Modal, cx } from "./ui";

export type View = { type: "saved"; id: string } | { type: "remote" } | null;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "T";

/** Far-left rail: your saved servers (green dot = live), the server you joined, create/join and disconnect. */
export function ServerRail({ view, onView, onAdd, onLeave }: { view: View; onView: (v: View) => void; onAdd: () => void; onLeave: () => void }) {
  const t = useT();
  const s = useSession();
  const { list, host } = useServers();
  const remote = s.server && !list.some((x) => x.id === s.server!.id) ? s.server : null;

  const Icon = ({ name, active, live, onClick, title }: { name: string; active: boolean; live: boolean; onClick: () => void; title: string }) => (
    <div className="relative">
      <span className={cx("absolute top-1/2 -left-3 w-1 -translate-y-1/2 rounded-r bg-fg transition-all", active ? "h-10" : "h-0")} />
      <button
        title={title}
        onClick={onClick}
        className={cx(
          "flex size-12 items-center justify-center text-sm font-bold transition-all",
          active ? "rounded-2xl bg-accent text-canvas" : "rounded-3xl bg-panel text-fg hover:rounded-2xl hover:bg-accent hover:text-canvas",
        )}
      >
        {initials(name)}
      </button>
      {live && <span className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-[3px] border-canvas bg-accent" title={t("Live")} />}
    </div>
  );

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-canvas py-3">
      {remote && (
        <>
          <Icon name={remote.name} title={remote.name} active={view?.type === "remote"} live={false} onClick={() => onView({ type: "remote" })} />
          <div className="my-1 h-0.5 w-8 rounded bg-line" />
        </>
      )}
      {list.map((srv) => (
        <Icon
          key={srv.id}
          name={srv.name}
          title={host?.serverId === srv.id ? `${srv.name} · ${t("Live")}` : `${srv.name} · ${t("Offline")}`}
          active={view?.type === "saved" && view.id === srv.id}
          live={host?.serverId === srv.id}
          onClick={() => onView({ type: "saved", id: srv.id })}
        />
      ))}
      <button title={t("Create or join a server")} onClick={onAdd} className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-panel text-accent transition-all hover:rounded-2xl hover:bg-accent hover:text-canvas">
        <Plus size={22} />
      </button>
      <div className="flex-1" />
      {s.server && (
        <button title={t("Disconnect")} onClick={onLeave} className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-panel text-fg2 transition-all hover:rounded-2xl hover:bg-red hover:text-fg">
          <LogOut size={18} />
        </button>
      )}
    </nav>
  );
}

/**
 * Channel list. Works for a live server (members, voice panel, footer) and for one of your saved
 * servers while offline. Owners can add, rename and delete channels in both states.
 */
export function ChannelSidebar({
  server,
  saved,
  live,
  selected,
  onSelect,
  onInvite,
  onShare,
  onSettings,
  onServerSettings,
}: {
  server: ServerInfo;
  saved: SavedServer | null; // set when you own this server
  live: boolean;
  selected: string | null;
  onSelect: (c: Channel) => void;
  onInvite: () => void;
  onShare: () => void;
  onSettings: () => void;
  onServerSettings: () => void;
}) {
  const t = useT();
  const s = useSession();
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [chanMenu, setChanMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [dialog, setDialog] = useState<{ kind: ChannelKind; channel?: Channel } | null>(null);
  const me = live && s.selfId ? s.members[s.selfId] : null;
  const text = server.channels.filter((c) => c.kind === "text");
  const voice = server.channels.filter((c) => c.kind === "voice");
  const inVoice = live && s.voiceChannel ? server.channels.find((c) => c.id === s.voiceChannel) : null;
  const owner = !!saved;

  const saveChannels = (channels: Channel[]) => void servers.update(saved!.id, { channels });

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <header className="flex h-12 items-center gap-1 border-b border-line pr-2 pl-4 shadow-sm">
        <button onClick={owner ? onServerSettings : undefined} className={cx("flex min-w-0 flex-1 items-center gap-1 text-left", owner && "hover:text-fg2")} title={owner ? t("Server settings") : undefined}>
          <span className="truncate text-[15px] font-semibold">{server.name}</span>
          {owner && <ChevronDown size={16} className="shrink-0 text-muted" />}
        </button>
        {owner && live && <IconButton icon={UserPlus} label={t("Invite friends")} onClick={onInvite} size={16} />}
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <Section title={t("Text channels")} onAdd={owner ? () => setDialog({ kind: "text" }) : undefined} addLabel={t("Create channel")}>
          {text.map((c) => (
            <ChannelRow
              key={c.id}
              active={selected === c.id}
              onClick={() => onSelect(c)}
              onContextMenu={owner ? (e) => (e.preventDefault(), setChanMenu({ x: e.clientX, y: e.clientY, channel: c })) : undefined}
              icon={<Hash size={18} className="text-muted" />}
              name={c.name}
            />
          ))}
        </Section>
        <Section title={t("Voice channels")} onAdd={owner ? () => setDialog({ kind: "voice" }) : undefined} addLabel={t("Create channel")}>
          {voice.map((c) => {
            const ids = live ? (s.voice[c.id] ?? []) : [];
            return (
              <div key={c.id}>
                <ChannelRow
                  active={selected === c.id}
                  onClick={() => onSelect(c)}
                  onContextMenu={owner ? (e) => (e.preventDefault(), setChanMenu({ x: e.clientX, y: e.clientY, channel: c })) : undefined}
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
                          setMenu({ x: e.clientX, y: e.clientY, memberId: id, stream: false });
                        }}
                        className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] text-fg2 hover:bg-hover"
                      >
                        <Avatar name={m.name} hue={m.hue} src={m.avatar} size={22} speaking={!!s.speaking[id] && !m.state.muted} />
                        <span className="flex-1 truncate">{m.name}</span>
                        {m.state.sharing && <span className="rounded bg-red px-1 text-[9px] font-bold text-fg">{t("LIVE")}</span>}
                        {m.state.camera && <Video size={13} className="text-fg2" />}
                        {m.state.deafened ? <HeadphoneOff size={13} className="text-red" /> : m.state.muted ? <MicOff size={13} className="text-red" /> : null}
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
              <div className="text-[13px] font-semibold text-accent">{t("Voice Connected")}</div>
              <div className="truncate text-xs text-muted">
                {inVoice.name} / {server.name}
              </div>
            </div>
            <IconButton icon={PhoneOff} label={t("Disconnect")} onClick={() => session.leaveVoice()} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => void session.toggleCamera()}
              className={cx("flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium", s.local.camera ? "bg-accent/20 text-accent" : "bg-elevated text-fg2 hover:bg-hover hover:text-fg")}
            >
              <Camera size={15} /> {t("Video")}
            </button>
            <button
              onClick={() => (s.local.sharing ? void session.stopShare() : onShare())}
              className={cx("flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium", s.local.sharing ? "bg-accent/20 text-accent" : "bg-elevated text-fg2 hover:bg-hover hover:text-fg")}
            >
              <MonitorUp size={15} /> {s.local.sharing ? t("Stop") : t("Screen")}
            </button>
          </div>
        </div>
      )}

      <UserFooter onSettings={onSettings} status={me ? (owner && live ? t("Hosting") : t("Online")) : t("Offline")} />

      {menu && <MemberMenu target={menu} onClose={() => setMenu(null)} />}
      {chanMenu && (
        <ChannelMenu
          at={chanMenu}
          onClose={() => setChanMenu(null)}
          onRename={() => setDialog({ kind: chanMenu.channel.kind, channel: chanMenu.channel })}
          onDelete={() => saveChannels(server.channels.filter((c) => c.id !== chanMenu.channel.id))}
        />
      )}
      {dialog && (
        <ChannelDialog
          kind={dialog.kind}
          channel={dialog.channel}
          onClose={() => setDialog(null)}
          onSave={(name, kind) => {
            if (dialog.channel) saveChannels(server.channels.map((c) => (c.id === dialog.channel!.id ? { ...c, name } : c)));
            else saveChannels([...server.channels, { id: "", name, kind }]);
            setDialog(null);
          }}
        />
      )}
    </aside>
  );
}

/** Avatar, name and mic/headphone/settings buttons at the bottom of the sidebar. */
function UserFooter({ onSettings, status }: { onSettings: () => void; status: string }) {
  const t = useT();
  const s = useSession();
  const me = s.selfId ? s.members[s.selfId] : null;
  return (
    <footer className="flex items-center gap-2 bg-canvas/60 px-2 py-2">
      {me ? (
        <>
          <Avatar name={me.name} hue={me.hue} src={me.avatar} size={32} speaking={!!s.speaking[me.id] && !s.local.muted} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{me.name}</div>
            <div className="text-[11px] text-muted">{status}</div>
          </div>
          <IconButton icon={s.local.muted ? MicOff : Mic} label={s.local.muted ? t("Unmute") : t("Mute")} onClick={() => session.toggleMute()} className={s.local.muted ? "text-red" : ""} />
          <IconButton
            icon={s.local.deafened ? HeadphoneOff : Headphones}
            label={s.local.deafened ? t("Undeafen") : t("Deafen")}
            onClick={() => session.toggleDeafen()}
            className={s.local.deafened ? "text-red" : ""}
          />
        </>
      ) : (
        <div className="min-w-0 flex-1 px-1 text-[12px] text-muted">{status}</div>
      )}
      <IconButton icon={Settings} label={t("User Settings")} onClick={onSettings} />
    </footer>
  );
}

function Section({ title, children, onAdd, addLabel }: { title: string; children: React.ReactNode; onAdd?: () => void; addLabel: string }) {
  return (
    <div className="mb-4">
      <div className="group flex items-center px-2 pb-1">
        <span className="flex-1 text-[11px] font-bold tracking-wider text-muted uppercase">{title}</span>
        {onAdd && (
          <button onClick={onAdd} title={addLabel} aria-label={addLabel} className="text-muted hover:text-fg">
            <Plus size={15} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function ChannelRow({ active, onClick, onContextMenu, icon, name }: { active: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void; icon: React.ReactNode; name: string }) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cx("flex h-8 items-center gap-1.5 rounded-md px-2 text-left text-[15px] transition-colors", active ? "bg-elevated text-fg" : "text-fg2 hover:bg-hover hover:text-fg")}
    >
      {icon}
      <span className="truncate">{name}</span>
    </button>
  );
}

function ChannelMenu({ at, onClose, onRename, onDelete }: { at: { x: number; y: number }; onClose: () => void; onRename: () => void; onDelete: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" className="animate-pop fixed z-[60] w-52 rounded-lg border border-line bg-panel p-1.5 text-[14px] shadow-2xl" style={{ left: at.x, top: at.y }}>
      <button onClick={() => (onRename(), onClose())} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-hover">
        <Pencil size={15} className="text-fg2" /> {t("Rename channel")}
      </button>
      <button onClick={() => (confirm ? (onDelete(), onClose()) : setConfirm(true))} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-red hover:bg-red/15">
        <Trash2 size={15} /> {confirm ? t("Click again to delete") : t("Delete channel")}
      </button>
    </div>
  );
}

function ChannelDialog({ kind: initialKind, channel, onClose, onSave }: { kind: ChannelKind; channel?: Channel; onClose: () => void; onSave: (name: string, kind: ChannelKind) => void }) {
  const t = useT();
  const [kind, setKind] = useState<ChannelKind>(initialKind);
  const [name, setName] = useState(channel?.name ?? "");
  const clean = kind === "text" ? name.trim().toLowerCase().replace(/\s+/g, "-") : name.trim();
  return (
    <Modal title={channel ? t("Rename channel") : t("Create channel")} onClose={onClose} width={440}>
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean) onSave(clean, kind);
        }}
      >
        {!channel && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{t("Channel type")}</span>
            {(
              [
                ["text", Hash, t("Text"), t("Messages and links")],
                ["voice", Volume2, t("Voice"), t("Talk, video and screen sharing")],
              ] as const
            ).map(([k, Icon, label, hint]) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={cx("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left", kind === k ? "border-accent bg-accent/10" : "border-line hover:border-faint")}
              >
                <Icon size={20} className="text-fg2" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{t("Channel name")}</span>
          <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 focus-within:border-accent/60">
            {kind === "text" ? <Hash size={16} className="text-muted" /> : <Volume2 size={16} className="text-muted" />}
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder={kind === "text" ? "new-channel" : t("Gaming")} className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
          </div>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!clean}>
            {channel ? t("Save") : t("Create channel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
