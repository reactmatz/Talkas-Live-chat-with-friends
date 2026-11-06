import { Globe, Server, Users, X } from "lucide-react";
import logo from "../assets/talkas-symbol.svg";
import { useEffect, useState } from "react";
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

/**
 * Accepts an invite in any of these forms and splits it into address + code:
 *   name.tun.ply.gg:13157#A1B2C3D4   (copied from the Invite window)
 *   192.168.0.10:4646 A1B2C3D4
 */
export function parseInvite(text: string): { address: string; key: string } | null {
  const m = /^\s*(\S+?)\s*[#\s]\s*([0-9a-f]{8})\s*$/i.exec(text);
  return m ? { address: m[1], key: m[2].toUpperCase() } : null;
}

/** Host or join, as a dismissible window over the app (click outside or Esc to go back). */
export function ConnectModal({ onHosted, onClose, initialMode }: { onHosted: (h: HostInfo | null) => void; onClose: () => void; initialMode?: "host" | "join" }) {
  const saved = load();
  const s = useSession();
  const st = settings.get();
  const [mode, setMode] = useState<"host" | "join">(native ? (initialMode ?? "host") : "join");
  const [name, setName] = useState(st.profile.name || saved.name || "");
  const [serverName, setServerName] = useState(saved.serverName ?? "Game Night");
  const [address, setAddress] = useState(saved.address ?? "");
  const [key, setKey] = useState("");
  const [stun, setStun] = useState(st.publicStun);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Close once the server welcomed us.
  useEffect(() => {
    if (submitted && s.status === "open" && s.server) onClose();
  }, [submitted, s.status, s.server, onClose]);

  const hue = st.profile.hue;
  const nick = name.trim() || "Guest";
  const field = "h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-accent/60";

  // Name from this window, everything else (bio, avatar, banner) from Settings → Profile.
  const profile = () => {
    settings.update((x) => ({ profile: { ...x.profile, name: nick, hue }, publicStun: stun }));
    return settings.get().profile;
  };

  const host = async () => {
    setBusy(true);
    setErr(null);
    try {
      const info = await native!.host.start(serverName.trim() || "My Server", DEFAULT_PORT);
      save({ name: nick, hue, serverName });
      onHosted(info);
      setSubmitted(true);
      session.connect({ address: `127.0.0.1:${info.port}`, key: info.inviteKey, hostToken: info.hostToken, profile: profile(), publicStun: stun });
    } catch (e) {
      setErr(String((e as Error).message ?? e).includes("EADDRINUSE") ? `Port ${DEFAULT_PORT} is already in use.` : "Couldn't start the server.");
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    save({ name: nick, hue, address });
    // Joining someone else: stop the server this PC was hosting (if any).
    void native?.host.stop();
    onHosted(null);
    setSubmitted(true);
    session.connect({ address, key, profile: profile(), publicStun: stun });
  };

  return (
    <div className="fixed inset-x-0 top-8 bottom-0 z-50 flex items-center justify-center overflow-y-auto bg-void/75 p-6 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-pop relative flex w-full max-w-[440px] flex-col gap-6 rounded-2xl border border-line bg-panel p-7 shadow-2xl">
        <button onClick={onClose} aria-label="Close" title="Close (Esc)" className="absolute top-4 right-4 rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg">
          <X size={18} />
        </button>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-accent">
            <img src={logo} alt="" className="size-6" draggable={false} />
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
              <span className="text-xs text-muted">Runs on this PC (port {DEFAULT_PORT}). Invite friends on the same Wi-Fi or through your playit.gg tunnel.</span>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold tracking-wider text-muted uppercase">Address or invite</span>
                <input
                  className={cx(field, "font-mono")}
                  value={address}
                  onChange={(e) => {
                    const inv = parseInvite(e.target.value);
                    if (inv) {
                      setAddress(inv.address);
                      setKey(inv.key);
                    } else setAddress(e.target.value);
                  }}
                  placeholder={`name.tun.ply.gg:12345 or 192.168.0.10:${DEFAULT_PORT}`}
                />
                <span className="text-xs text-muted">Paste the whole invite (address#CODE) and the code fills in by itself.</span>
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

          {(err || (submitted && s.error)) && <p className="text-sm text-red">{err ?? s.error}</p>}
          {submitted && s.status === "connecting" && <p className="text-sm text-fg2">Connecting…</p>}

          <Button type="submit" variant="primary" disabled={busy || (mode === "join" && (!address.trim() || key.trim().length < 8))} className="h-10">
            {mode === "host" ? "Start server" : "Join"}
          </Button>
        </form>
      </div>
    </div>
  );
}
