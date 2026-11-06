import { Check, CircleAlert, Copy, Globe, Link2, Loader2, Square, Wifi } from "lucide-react";
import { t } from "../lib/i18n";
import { useEffect, useState } from "react";
import { native, type HostInfo, type TunnelState } from "../lib/native";
import { Button, Modal } from "./ui";

/**
 * Invite friends. Two ways in:
 *  - Internet: a Cloudflare link (wss://….trycloudflare.com) created on demand — no account, no router setup,
 *    and friends never see this PC's IP during the handshake.
 *  - Same Wi-Fi: direct LAN IP + port.
 * Either way the invite code is required, and voice/video connect peer to peer afterwards.
 */
export function InviteModal({ host, onClose }: { host: HostInfo; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [tunnel, setTunnel] = useState<TunnelState>({ state: "off" });

  useEffect(() => {
    if (!native) return;
    void native.tunnel.state().then(setTunnel);
    return native.tunnel.onState(setTunnel);
  }, []);

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

  const invite = tunnel.state === "on" ? `${tunnel.url}#${host.inviteKey}` : "";
  const busy = tunnel.state === "downloading" || tunnel.state === "starting";

  return (
    <Modal title={t("Invite friends to {name}", { name: host.name })} onClose={onClose} width={540}>
      <div className="flex flex-col gap-5 p-5">
        <Row label={t("Invite code")} value={host.inviteKey} />

        {/* Internet — Cloudflare quick tunnel */}
        <section className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-accent" />
            <span className="flex-1 text-sm font-semibold">{t("Over the internet · link")}</span>
            {tunnel.state === "on" && (
              <span className="flex items-center gap-1.5 text-xs text-accent">
                <span className="size-2 rounded-full bg-accent" /> Online
              </span>
            )}
          </div>

          {tunnel.state === "on" ? (
            <>
              <Row label={t("Invite")} value={invite} />
              <div className="flex items-center gap-2 text-xs text-accent">
                <Check size={14} /> Reachable — send this invite to your friends. They paste it into “Join a friend”.
              </div>
              <div>
                <Button variant="ghost" onClick={() => void native?.tunnel.stop()}>
                  <Square size={13} /> Stop link
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Button variant="primary" disabled={busy || !native} onClick={() => void native?.tunnel.start()}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                  {tunnel.state === "downloading" ? t("Downloading… {percent}%", { percent: tunnel.percent }) : tunnel.state === "starting" ? t("Creating link…") : t("Create internet link")}
                </Button>
                <span className="text-xs text-muted">{t("Free, no account, no router setup.")}</span>
              </div>
              {tunnel.state === "error" && (
                <div className="flex items-start gap-2 text-xs text-amber">
                  <CircleAlert size={14} className="shrink-0" />
                  <span>{tunnel.message}</span>
                </div>
              )}
            </>
          )}

          <p className="text-xs leading-relaxed text-muted">
            {t("Uses a Cloudflare tunnel: friends reach your server through a trycloudflare.com address and never see your IP during the handshake. The first time, Talkas downloads Cloudflare's cloudflared. The link changes every time you go live. Voice and video still connect directly between PCs.")}
          </p>
        </section>

        {/* LAN */}
        <section className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="flex items-center gap-2">
            <Wifi size={16} className="text-fg2" />
            <span className="text-sm font-semibold">{t("Same Wi-Fi · direct IP")}</span>
          </div>
          {host.addresses.length === 0 && <p className="text-xs text-muted">{t("No network adapter found.")}</p>}
          {host.addresses.map((a) => (
            <Row key={a} label={t("LAN address")} value={`${a.replace(/^ws:\/\//, "")}#${host.inviteKey}`} />
          ))}
        </section>
      </div>
    </Modal>
  );
}
