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
import { useFriends } from "../lib/friends";
import { servers, useServers } from "../lib/servers";
import { session, useSession } from "../lib/session";
import { MemberMenu, type MenuTarget } from "./MemberMenu";
import logo from "../assets/talkas-symbol.svg";
import { Avatar, Button, IconButton, Modal, cx, hueGradient, initials } from "./ui";

export type View = { type: "saved"; id: string } | { type: "friend"; id: string } | { type: "remote" } | null;

/** Stable hue per server name, so each server keeps its colour in the rail. */
const nameHue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Far-left rail: your saved servers (green dot = live), the server you joined, create/join and disconnect. */
export function ServerRail({ view, onView, onAdd, onLeave }: { view: View; onView: (v: View) => void; onAdd: () => void; onLeave: () => void }) {
  const t = useT();
  const s = useSession();
  const { list, host } = useServers();
  const fr = useFriends();
  const connectedTo = s.server && s.status !== "idle" ? s.server.id : null;
  const remote = s.server && !list.some((x) => x.id === s.server!.id) && !fr.list.some((f) => f.id === s.server!.id) ? s.server : null;

  const Icon = ({ name, active, live, onClick, title }: { name: string; active: boolean; live: boolean; onClick: () => void; title: string }) => (
    <div className="relative shrink-0">
      <span className={cx("absolute top-1/2 -left-4 w-1 -translate-y-1/2 rounded-r bg-accent-soft transition-all", active ? "h-8" : "h-0")} />
      <button
        title={title}
        onClick={onClick}
        style={{ background: hueGradient(nameHue(name)) }}
        className={cx(
          "flex size-12 items-center justify-center rounded-2xl text-[15px] font-bold text-light transition-all",
          active ? "ring-2 ring-accent-soft ring-offset-2 ring-offset-void" : live ? "hover:brightness-110" : "opacity-60 saturate-50 hover:opacity-100 hover:saturate-100",
        )}
      >
        {initials(name)}
      </button>
      {live && <span className="absolute -right-1 -bottom-1 size-4 rounded-full border-[3px] border-void bg-accent" title={t("Live")} />}
    </div>
  );
  const Label = ({ children }: { children: string }) => <span className="pt-1 text-[9.5px] font-semibold tracking-[0.12em] text-muted uppercase">{children}</span>;

  return (
    <nav className="flex w-20 shrink-0 flex-col items-center gap-3 overflow-y-auto bg-void py-4">
      <img src={logo} alt="Talkas" className="size-12 shrink-0" draggable={false} />
      <div className="h-0.5 w-7 shrink-0 rounded bg-line" />
      {remote && (
        <>
          <Icon name={remote.name} title={remote.name} active={view?.type === "remote"} live onClick={() => onView({ type: "remote" })} />
          <div className="h-0.5 w-7 shrink-0 rounded bg-line" />
        </>
      )}
      {list.length > 0 && <Label>{t("Yours")}</Label>}
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
      {fr.list.length > 0 && <Label>{t("Friends")}</Label>}
      {fr.list.map((f) => {
        const here = connectedTo === f.id;
        const online = here || fr.status[f.id]?.state === "online";
        return (
          <Icon
            key={f.id}
            name={f.name}
            title={`${f.name} · ${online ? t("Live") : t("Offline")}`}
            active={(view?.type === "friend" && view.id === f.id) || (view?.type === "remote" && here)}
            live={online}
            onClick={() => onView(here ? { type: "remote" } : { type: "friend", id: f.id })}
          />
        );
      })}
      <button title={t("Create or join a server")} onClick={onAdd} className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-dashed border-faint text-accent-soft transition-all hover:border-accent hover:bg-accent/10">
        <Plus size={22} />
      </button>
      <div className="flex-1" />
      {s.server && (
        <button title={t("Disconnect")} onClick={onLeave} className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-fg2 transition-colors hover:bg-red/15 hover:text-red">
          <LogOut size={19} />
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
    <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-panel">
      <header className="flex items-center gap-2 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18px] font-bold tracking-tight">{server.name}</div>
          <div className={cx("mt-1 flex items-center gap-1.5 text-xs font-medium", live ? "text-accent-soft" : "text-muted")}>
            <span className={cx("size-2 rounded-full", live ? "bg-accent" : "bg-faint")} />
            {live ? (owner ? t("Live · you're hosting") : t("Live")) : t("Offline")}
          </div>
        </div>
        {owner && live && <IconButton icon={UserPlus} label={t("Invite friends")} onClick={onInvite} size={17} className="size-8 bg-elevated" />}
        {owner && <IconButton icon={ChevronDown} label={t("Server settings")} onClick={onServerSettings} size={17} className="size-8 bg-elevated" />}
      </header>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <Section title={t("Text channels")} onAdd={owner ? () => setDialog({ kind: "text" }) : undefined} addLabel={t("Create channel")}>
          {text.map((c) => (
            <ChannelRow
              key={c.id}
              active={selected === c.id}
              onClick={() => onSelect(c)}
              onContextMenu={owner ? (e) => (e.preventDefault(), setChanMenu({ x: e.clientX, y: e.clientY, channel: c })) : undefined}
              icon={<Hash size={17} className="text-muted" />}
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
                  icon={<Volume2 size={17} className="text-muted" />}
                  name={c.name}
                />
                <div className="flex flex-col gap-0.5 pb-1 pl-9">
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
                        className={cx("flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-[13px] hover:bg-hover", s.speaking[id] && !m.state.muted ? "text-fg" : "text-fg2")}
                      >
                        <Avatar name={m.name} hue={m.hue} src={m.avatar} size={24} speaking={!!s.speaking[id] && !m.state.muted} />
                        <span className="flex-1 truncate">{m.name}</span>
                        {m.state.sharing && <span className="rounded-md bg-red px-1.5 text-[9px] leading-4 font-bold text-light">{t("LIVE")}</span>}
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
        <div className="mx-3 mb-3 rounded-2xl border border-accent/35 bg-elevated p-3.5">
          <div className="flex items-center gap-2.5">
            <Signal size={18} className="shrink-0 text-accent-soft" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-accent-soft">{t("Voice Connected")}</div>
              <div className="truncate text-xs text-muted">
                {inVoice.name} · {server.name}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              title={s.local.camera ? t("Turn off camera") : t("Turn on camera")}
              onClick={() => void session.toggleCamera()}
              className={cx("flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors", s.local.camera ? "bg-accent/20 text-accent-soft" : "bg-hover text-fg hover:bg-faint/60")}
            >
              <Camera size={16} /> {t("Video")}
            </button>
            <button
              title={s.local.sharing ? t("Stop sharing") : t("Share your screen")}
              onClick={() => (s.local.sharing ? void session.stopShare() : onShare())}
              className={cx("flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors", s.local.sharing ? "bg-accent/20 text-accent-soft" : "bg-hover text-fg hover:bg-faint/60")}
            >
              <MonitorUp size={16} /> {s.local.sharing ? t("Stop") : t("Screen")}
            </button>
            <button title={t("Disconnect")} onClick={() => session.leaveVoice()} className="flex h-9 items-center justify-center rounded-xl bg-red text-light transition-colors hover:bg-red/85">
              <PhoneOff size={16} />
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
    <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
      {me ? (
        <>
          <Avatar name={me.name} hue={me.hue} src={me.avatar} size={36} speaking={!!s.speaking[me.id] && !s.local.muted} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{me.name}</div>
            <div className="text-xs text-muted">{status}</div>
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
    <div className="mb-5">
      <div className="group flex items-center px-2 pb-1.5">
        <span className="flex-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{title}</span>
        {onAdd && (
          <button onClick={onAdd} title={addLabel} aria-label={addLabel} className="text-muted hover:text-fg">
            <Plus size={15} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function ChannelRow({ active, onClick, onContextMenu, icon, name }: { active: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void; icon: React.ReactNode; name: string }) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cx(
        "flex h-[38px] w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] transition-colors [&_svg]:shrink-0",
        active ? "bg-hover font-semibold text-fg [&_svg]:text-accent-soft" : "font-medium text-fg2 hover:bg-hover/60 hover:text-fg",
      )}
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
