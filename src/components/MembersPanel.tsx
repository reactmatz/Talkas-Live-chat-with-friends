import { Crown, HeadphoneOff, MicOff, MonitorUp, UserPlus, Video, X } from "lucide-react";
import { useState } from "react";
import type { ServerInfo } from "../../shared/protocol";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { MemberMenu, type MenuTarget } from "./MemberMenu";
import { Avatar, IconButton, cx, hueGradient, initials } from "./ui";

const nameHue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Right panel next to a text channel: the server card, the invite button (host) and who is online / in voice. */
export function MembersPanel({ server, onInvite, onClose }: { server: ServerInfo; onInvite?: () => void; onClose: () => void }) {
  const t = useT();
  const s = useSession();
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const all = Object.values(s.members);
  const voiceOf = (id: string) => server.channels.find((c) => c.kind === "voice" && (s.voice[c.id] ?? []).includes(id));
  const inVoice = all.filter((m) => voiceOf(m.id));
  const online = all.filter((m) => !voiceOf(m.id));
  const host = all.find((m) => m.host);

  const row = (m: (typeof all)[number]) => {
    const vc = voiceOf(m.id);
    const speaking = !!s.speaking[m.id] && !m.state.muted;
    const status = m.state.sharing ? t("Sharing screen") : speaking ? t("Speaking") : vc ? vc.name : m.id === s.selfId ? t("You") : t("Online");
    return (
      <div
        key={m.id}
        onContextMenu={(e) => {
          e.preventDefault();
          if (vc) setMenu({ x: e.clientX, y: e.clientY, memberId: m.id, stream: false });
        }}
        className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-hover/60"
      >
        <Avatar name={m.name} hue={m.hue} src={m.avatar} size={36} speaking={speaking} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold">
            <span className="truncate">{m.name}</span>
            {m.host && <Crown size={12} className="shrink-0 text-amber" aria-label={t("Host")} />}
          </div>
          <div className={cx("truncate text-xs", speaking ? "text-accent-soft" : "text-muted")}>{status}</div>
        </div>
        {m.state.sharing && <MonitorUp size={14} className="text-accent-soft" />}
        {m.state.camera && <Video size={14} className="text-fg2" />}
        {m.state.deafened ? <HeadphoneOff size={14} className="text-red" /> : m.state.muted ? <MicOff size={14} className="text-muted" /> : null}
      </div>
    );
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-2 px-5 pt-5">
        <span className="flex-1 text-[15px] font-semibold">{t("Server info")}</span>
        <IconButton icon={X} label={t("Close")} onClick={onClose} size={16} />
      </div>
      <div className="flex flex-col items-center gap-1.5 px-5 pt-5 pb-5 text-center">
        <div className="relative mb-2">
          <span className="flex size-[76px] items-center justify-center rounded-[24px] text-2xl font-bold text-light" style={{ background: hueGradient(nameHue(server.name)) }}>
            {initials(server.name)}
          </span>
          <span className="absolute -right-1 -bottom-1 size-5 rounded-full border-4 border-panel bg-accent" />
        </div>
        <div className="text-[17px] font-bold tracking-tight">{server.name}</div>
        <div className="text-xs text-muted">{host ? t("Hosted by {name} · {count} online", { name: host.name, count: all.length }) : t("{count} online", { count: all.length })}</div>
      </div>
      {onInvite && (
        <div className="px-5 pb-5">
          <button onClick={onInvite} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent-soft to-accent text-sm font-semibold text-canvas hover:brightness-110">
            <UserPlus size={17} /> {t("Invite friends")}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto border-t border-line px-3 pt-4 pb-4">
        {inVoice.length > 0 && (
          <div className="mb-5">
            <div className="px-2 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{t("In voice · {count}", { count: inVoice.length })}</div>
            {inVoice.map(row)}
          </div>
        )}
        {online.length > 0 && (
          <div>
            <div className="px-2 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{t("Online · {count}", { count: online.length })}</div>
            {online.map(row)}
          </div>
        )}
      </div>
      {menu && <MemberMenu target={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
