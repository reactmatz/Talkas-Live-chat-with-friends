import { Globe, Radio, Server, Users } from "lucide-react";
import { useState } from "react";
import { DEFAULT_PORT } from "../../shared/protocol";
import { native, type HostInfo } from "../lib/native";
import { session, useSession } from "../lib/session";
import { settings } from "../lib/settings";
import { Avatar, Button, cx } from "./ui";

const STORE = "talkas.connect";
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<{ name: string; hue: number; address: string; serverName: string }>;
  } catch {
    return {};
  }
}
function save(v: object) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...load(), ...v }));
  } catch {
    // storage unavailable: fine
  }
}

export function ConnectScreen({ onHosted }: { onHosted: (h: HostInfo) => void }) {
  const saved = load();
  const s = useSession();
  const [mode, setMode] = useState<"host" | "join">(native ? "host" : "join");
  const st = settings.get();
  const [name, setName] = useState(st.profile.name || saved.name || "");
  const hue = st.profile.hue;
  const [serverName, setServerName] = useState(saved.serverName ?? "Game Night");
  const [address, setAddress] = useState(saved.address ?? "");
  const [key, setKey] = useState("");
  const [stun, setStun] = useState(st.publicStun);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Name from this screen, everything else (bio, avatar, banner) from Settings → Profile.
  const profile = () => {
    settings.update((st) => ({ profile: { ...st.profile, name: nick, hue }, publicStun: stun }));
    return settings.get().profile;
  };
  const field = "h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-accent/60";
  const nick = name.trim() || "Guest";

  const host = async () => {
    setBusy(true);
    setErr(null);
    try {
      const info = await native!.host.start(serverName.trim() || "My Server", DEFAULT_PORT);
      save({ name: nick, hue, serverName });
      onHosted(info);
      session.connect({ address: `127.0.0.1:${info.port}`, key: info.inviteKey, profile: profile(), publicStun: stun });
    } catch (e) {
      setErr(String((e as Error).message ?? e).includes("EADDRINUSE") ? `Port ${DEFAULT_PORT} is already in use.` : "Couldn't start the server.");
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    save({ name: nick, hue, address });
    session.connect({ address, key, profile: profile(), publicStun: stun });
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="animate-pop flex w-full max-w-[440px] flex-col gap-6 rounded-2xl border border-line bg-panel p-7">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-accent">
            <Radio size={18} />
            <span className="text-xs font-bold tracking-[0.14em] uppercase">Talkas</span>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight">Talk, play and stream — peer to peer.</h1>
          <p className="text-sm leading-relaxed text-fg2">Voice and screens go straight between computers. No accounts, no media servers.</p>
        </div>

        {native && (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas p-1">
            {(
              [
                ["host", Server, "Host a server"],
                ["join", Users, "Join a friend"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={cx("flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition", mode === id ? "bg-elevated text-fg" : "text-muted hover:text-fg2")}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        )}

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "host") void host();
            else join();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-wider text-muted uppercase">Display name</span>
            <div className="flex items-center gap-3">
              <Avatar name={nick} hue={hue} size={40} src={st.profile.avatar} />
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="How friends see you" maxLength={32} autoFocus />
            </div>
          </label>

          {mode === "host" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold tracking-wider text-muted uppercase">Server name</span>
              <input className={field} value={serverName} onChange={(e) => setServerName(e.target.value)} maxLength={40} />
              <span className="text-xs text-muted">Runs on this PC (port {DEFAULT_PORT}). You'll get an invite code to share.</span>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold tracking-wider text-muted uppercase">Host address</span>
                <input className={cx(field, "font-mono")} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`192.168.0.10:${DEFAULT_PORT}`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold tracking-wider text-muted uppercase">Invite code</span>
                <input className={cx(field, "font-mono tracking-[0.2em] uppercase")} value={key} onChange={(e) => setKey(e.target.value)} placeholder="A1B2C3D4" maxLength={8} />
              </label>
            </>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg2">
            <input type="checkbox" checked={stun} onChange={(e) => setStun(e.target.checked)} className="mt-0.5 accent-[#10b981]" />
            <span>
              <span className="flex items-center gap-1.5 text-fg">
                <Globe size={13} /> Allow calls over the internet
              </span>
              <span className="text-xs text-muted">Uses a public STUN server only to find addresses. Media still goes peer to peer. Off = LAN only.</span>
            </span>
          </label>

          {(err || s.error) && <p className="text-sm text-red">{err ?? s.error}</p>}
          {s.status === "connecting" && <p className="text-sm text-fg2">Connecting…</p>}

          <Button type="submit" variant="primary" disabled={busy || (mode === "join" && (!address.trim() || key.trim().length < 8))} className="h-10">
            {mode === "host" ? "Start server" : "Join"}
          </Button>
        </form>
      </div>
    </div>
  );
}
