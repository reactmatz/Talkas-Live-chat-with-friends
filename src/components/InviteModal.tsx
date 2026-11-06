import { Check, CircleAlert, Copy, Globe, Loader2, Play, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { native, type HostInfo, type PlayitStatus } from "../lib/native";
import { settings, useSettings } from "../lib/settings";
import { Button, Modal, cx } from "./ui";

const PLAYIT_DOWNLOAD = "https://playit.gg/download";

/**
 * Invite friends. Two ways in, both kept:
 *  - Internet: the playit.gg tunnel address (forwards to this PC's port), checked live from here.
 *  - Same Wi-Fi: direct LAN IP + port.
 * Either way the invite code is required, and voice/video connect peer to peer afterwards.
 */
export function InviteModal({ host, onClose }: { host: HostInfo; onClose: () => void }) {
  const st = useSettings();
  const [copied, setCopied] = useState<string | null>(null);
  const [tunnel, setTunnel] = useState(st.tunnelAddress);
  const [agent, setAgent] = useState<PlayitStatus | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | "checking" | null>(null);

  const cleanTunnel = tunnel.trim().replace(/^wss?:\/\//, "").replace(/\/.*$/, "");
  const invite = cleanTunnel ? `${cleanTunnel}#${host.inviteKey}` : "";

  useEffect(() => {
    void native?.playit.status().then(setAgent);
  }, []);

  // Save the address and test it (debounced while typing).
  useEffect(() => {
    if (cleanTunnel === st.tunnelAddress && check) return;
    const t = setTimeout(() => {
      settings.update({ tunnelAddress: cleanTunnel });
      if (!cleanTunnel || !native) return setCheck(null);
      setCheck("checking");
      void native.playit.check(cleanTunnel).then(setCheck);
    }, 700);
    return () => clearTimeout(t);
  }, [cleanTunnel]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (v: string) =>
    void navigator.clipboard.writeText(v).then(() => {
      setCopied(v);
      setTimeout(() => setCopied(null), 1500);
    });

  const Row = ({ label, value }: { label: string; value: string }) => (
    <button onClick={() => copy(value)} className="flex w-full items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2.5 text-left hover:border-faint">
      <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
      <span className="flex-1 truncate font-mono text-sm">{value}</span>
      {copied === value ? <Check size={15} className="text-accent" /> : <Copy size={15} className="text-muted" />}
    </button>
  );

  return (
    <Modal title={`Invite friends to ${host.name}`} onClose={onClose} width={540}>
      <div className="flex flex-col gap-5 p-5">
        <Row label="Invite code" value={host.inviteKey} />

        {/* Internet — playit.gg */}
        <section className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-accent" />
            <span className="flex-1 text-sm font-semibold">Over the internet · playit.gg</span>
            {agent && (
              <span className={cx("flex items-center gap-1.5 text-xs", agent.running ? "text-accent" : "text-amber")}>
                <span className={cx("size-2 rounded-full", agent.running ? "bg-accent" : "bg-amber")} />
                {agent.running ? "Agent running" : agent.installed ? "Agent stopped" : "Agent not installed"}
              </span>
            )}
          </div>

          {agent && !agent.running && (
            <div className="flex items-center gap-2">
              {agent.installed ? (
                <Button onClick={() => void native!.playit.start().then(setAgent)}>
                  <Play size={14} /> Start playit
                </Button>
              ) : (
                <Button onClick={() => void native!.openExternal(PLAYIT_DOWNLOAD)}>Download playit</Button>
              )}
              <span className="text-xs text-muted">The agent must run on this PC for the tunnel to work.</span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-fg2">Tunnel address (from playit.gg → Tunnels)</span>
            <input
              value={tunnel}
              onChange={(e) => setTunnel(e.target.value)}
              placeholder="name.tun.ply.gg or name.ply.gg:12345"
              spellCheck={false}
              className="h-10 rounded-md border border-line bg-canvas px-3 font-mono text-sm outline-none placeholder:text-muted focus:border-accent/60"
            />
          </label>

          {check && (
            <div className={cx("flex items-start gap-2 text-xs", check === "checking" ? "text-fg2" : check.ok ? "text-accent" : "text-amber")}>
              {check === "checking" ? <Loader2 size={14} className="animate-spin" /> : check.ok ? <Check size={14} /> : <CircleAlert size={14} className="shrink-0" />}
              <span>{check === "checking" ? "Testing the tunnel…" : check.message}</span>
            </div>
          )}

          {invite && <Row label="Invite" value={invite} />}
          <p className="text-xs leading-relaxed text-muted">
            In playit.gg create a <b className="text-fg2">TCP</b> tunnel whose local address is <span className="font-mono text-fg2">127.0.0.1:{host.port}</span>. Friends paste the invite into
            “Join a friend”. Only the handshake uses the tunnel — voice and video connect directly.
          </p>
        </section>

        {/* LAN */}
        <section className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="flex items-center gap-2">
            <Wifi size={16} className="text-fg2" />
            <span className="text-sm font-semibold">Same Wi-Fi · direct IP</span>
          </div>
          {host.addresses.length === 0 && <p className="text-xs text-muted">No network adapter found.</p>}
          {host.addresses.map((a) => {
            const addr = a.replace(/^ws:\/\//, "");
            return <Row key={a} label="LAN address" value={addr} />;
          })}
        </section>
      </div>
    </Modal>
  );
}
