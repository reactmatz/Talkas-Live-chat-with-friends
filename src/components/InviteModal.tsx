import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { HostInfo } from "../lib/native";
import { Modal } from "./ui";

export function InviteModal({ host, onClose }: { host: HostInfo; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (v: string) => {
    void navigator.clipboard.writeText(v).then(() => {
      setCopied(v);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const Row = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
    <button onClick={() => copy(value)} className="flex w-full items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2.5 text-left hover:border-faint">
      <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
      <span className={`flex-1 truncate text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
      {copied === value ? <Check size={15} className="text-accent" /> : <Copy size={15} className="text-muted" />}
    </button>
  );
  return (
    <Modal title={`Invite friends to ${host.name}`} onClose={onClose} width={480}>
      <div className="flex flex-col gap-3 p-5">
        <Row label="Invite code" value={host.inviteKey} />
        {host.addresses.map((a) => (
          <Row key={a} label="LAN address" value={a.replace(/^ws:\/\//, "")} />
        ))}
        <p className="text-xs leading-relaxed text-muted">
          Same Wi-Fi: share a LAN address and the code. Over the internet: forward TCP port {host.port} on your router (or use a tunnel like playit.gg) and share
          that address instead. Only the handshake uses this port; voice and video connect directly between PCs.
        </p>
      </div>
    </Modal>
  );
}
