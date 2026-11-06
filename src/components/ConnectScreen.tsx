import { Globe, Server, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "../assets/talkas-symbol.svg";
import { DEFAULT_PORT } from "../../shared/protocol";
import { useT } from "../lib/i18n";
import { native } from "../lib/native";
import { servers } from "../lib/servers";
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
 *   wss://words.trycloudflare.com#A1B2C3D4   (internet link from the Invite window)
 *   192.168.0.10:4646#A1B2C3D4               (same Wi-Fi)
 *   192.168.0.10:4646 A1B2C3D4
 */
export function parseInvite(text: string): { address: string; key: string } | null {
  const m = /^\s*(\S+?)\s*[#\s]\s*([0-9a-f]{8})\s*$/i.exec(text);
  return m ? { address: m[1], key: m[2].toUpperCase() } : null;
}

/** Create one of your own servers, or join a friend's — a dismissible window over the app. */
export function ConnectModal({
  onCreated,
  onJoined,
  onClose,
  initialMode,
}: {
  onCreated: (serverId: string) => void;
  onJoined: () => void;
  onClose: () => void;
  initialMode?: "create" | "join";
}) {
  const t = useT();
  const saved = load();
  const s = useSession();
  const st = settings.get();
  const [mode, setMode] = useState<"create" | "join">(native ? (initialMode ?? "create") : "join");
  const [name, setName] = useState(st.profile.name || saved.name || "");
  const [serverName, setServerName] = useState("");
  const [goLive, setGoLive] = useState(false);
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

  // Close once the friend's server welcomed us.
  useEffect(() => {
    if (submitted && s.status === "open" && s.server) {
      onJoined();
      onClose();
    }
  }, [submitted, s.status, s.server, onClose, onJoined]);

  const hue = st.profile.hue;
  const nick = name.trim() || "Guest";
  const field = "h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-accent/60";

  // Name from this window, everything else (bio, avatar, banner) from Settings → Profile.
  const profile = () => {
    settings.update((x) => ({ profile: { ...x.profile, name: nick, hue }, publicStun: stun }));
    return settings.get().profile;
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      profile();
      const srv = await servers.create(serverName.trim() || t("My Server"));
      onCreated(srv.id); // the server exists even if going live fails below
      if (goLive) await servers.goLive(srv.id);
      onClose();
    } catch (e) {
      setErr(servers.errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    save({ name: nick, hue, address });
    if (servers.get().host) servers.goOffline(); // one server at a time: stop hosting yours
    setSubmitted(true);
    session.connect({ address, key, profile: profile(), publicStun: stun });
  };

  return (
    <div className="fixed inset-x-0 top-8 bottom-0 z-50 flex items-center justify-center overflow-y-auto bg-void/75 p-6 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-pop relative flex w-full max-w-[440px] flex-col gap-6 rounded-2xl border border-line bg-panel p-7 shadow-2xl">
        <button onClick={onClose} aria-label={t("Close")} title={t("Close (Esc)")} className="absolute top-4 right-4 rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg">
          <X size={18} />
        </button>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-accent">
            <img src={logo} alt="" className="size-6" draggable={false} />
            <span className="text-xs font-bold tracking-[0.14em] uppercase">Talkas</span>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("Talk, play and stream — peer to peer.")}</h1>
          <p className="text-sm leading-relaxed text-fg2">{t("Voice and screens go straight between computers. No accounts, no media servers.")}</p>
        </div>

        {native && (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas p-1">
            {(
              [
                ["create", Server, t("Create a server")],
                ["join", Users, t("Join a friend")],
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
            if (mode === "create") void create();
            else join();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{t("Display name")}</span>
            <div className="flex items-center gap-3">
              <Avatar name={nick} hue={hue} size={40} src={st.profile.avatar} />
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("How friends see you")} maxLength={32} autoFocus />
            </div>
          </label>

          {mode === "create" ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{t("Server name")}</span>
                <input className={field} value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder={t("Game Night")} maxLength={40} />
                <span className="text-xs text-muted">{t("Saved on this PC. Set up its channels first and go live whenever you want to host it.")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg2">
                <input type="checkbox" checked={goLive} onChange={(e) => setGoLive(e.target.checked)} className="accent-[#10b981]" />
                {t("Go live right away")}
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{t("Address or invite")}</span>
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
                  placeholder={`wss://….trycloudflare.com ${t("or")} 192.168.0.10:${DEFAULT_PORT}`}
                />
                <span className="text-xs text-muted">{t("Paste the whole invite (address#CODE) and the code fills in by itself.")}</span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{t("Invite code")}</span>
                <input className={cx(field, "font-mono tracking-[0.2em] uppercase")} value={key} onChange={(e) => setKey(e.target.value)} placeholder="A1B2C3D4" maxLength={8} />
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg2">
                <input type="checkbox" checked={stun} onChange={(e) => setStun(e.target.checked)} className="mt-0.5 accent-[#10b981]" />
                <span>
                  <span className="flex items-center gap-1.5 text-fg">
                    <Globe size={13} /> {t("Allow calls over the internet")}
                  </span>
                  <span className="text-xs text-muted">{t("Uses a public STUN server only to find addresses. Media still goes peer to peer. Off = LAN only.")}</span>
                </span>
              </label>
            </>
          )}

          {(err || (submitted && s.error)) && <p className="text-sm text-red">{err ?? s.error}</p>}
          {submitted && s.status === "connecting" && <p className="text-sm text-fg2">{t("Connecting…")}</p>}

          <Button type="submit" variant="primary" disabled={busy || (mode === "join" && (!address.trim() || key.trim().length < 8))} className="h-10">
            {mode === "create" ? t("Create server") : t("Join")}
          </Button>
        </form>
      </div>
    </div>
  );
}
