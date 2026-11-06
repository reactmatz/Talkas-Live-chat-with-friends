import { Globe, Lock, Power, Radio, Trash2 } from "lucide-react";
import { useState } from "react";
import logo from "../assets/talkas-symbol.svg";
import { useT } from "../lib/i18n";
import type { SavedServer } from "../lib/native";
import { servers, useServers } from "../lib/servers";
import { Button, Modal, cx } from "./ui";

/** Main area of one of your servers while it's offline: the big "Go live" call to action. */
export function OfflineServer({ server, onLive }: { server: SavedServer; onLive: () => void }) {
  const t = useT();
  const { host } = useServers();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const other = host && host.serverId !== server.id ? servers.get().list.find((s) => s.id === host.serverId) : null;

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await servers.goLive(server.id);
      onLive();
    } catch (e) {
      setErr(servers.errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-elevated/40 p-8 text-center">
      <div className="relative">
        <img src={logo} alt="" className="size-16 opacity-60 grayscale" draggable={false} />
        <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-panel bg-faint">
          <Lock size={11} />
        </span>
      </div>
      <div className="max-w-[420px]">
        <h1 className="text-xl font-bold">{t("{name} is offline", { name: server.name })}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-fg2">
          {t("Only you can see it right now. Set up the channels on the left, then go live to host it from this PC and invite friends.")}
        </p>
      </div>
      <Button variant="primary" onClick={() => void go()} disabled={busy} className="h-11 px-6">
        <Radio size={16} /> {busy ? t("Starting…") : t("Go live")}
      </Button>
      {other && <p className="text-xs text-amber">{t("{name} is live right now — going live here takes it offline.", { name: other.name })}</p>}
      {err && <p className="text-sm text-red">{err}</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Globe size={12} /> {t("Friends join with an invite (same Wi-Fi or internet link). Chat history is kept between sessions.")}
      </p>
    </main>
  );
}

/** Rename, go offline/live and delete one of your servers. */
export function ServerSettingsModal({ server, onClose, onDeleted, onLive }: { server: SavedServer; onClose: () => void; onDeleted: () => void; onLive: () => void }) {
  const t = useT();
  const { host } = useServers();
  const [name, setName] = useState(server.name);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = host?.serverId === server.id;

  return (
    <Modal title={t("Server settings")} onClose={onClose} width={480}>
      <div className="flex flex-col gap-5 p-5">
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void servers.update(server.id, { name }).then(onClose);
          }}
        >
          <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{t("Server name")}</span>
          <div className="flex gap-2">
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-10 flex-1 rounded-md border border-line bg-canvas px-3 text-sm outline-none focus:border-accent/60" />
            <Button type="submit" variant="primary" disabled={!name.trim() || name.trim() === server.name}>
              {t("Save")}
            </Button>
          </div>
        </form>

        <div className="flex items-center gap-3 rounded-lg border border-line p-4">
          <span className={cx("size-2.5 rounded-full", live ? "bg-accent" : "bg-faint")} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{live ? t("Live from this PC") : t("Offline")}</div>
            <div className="text-xs text-muted">{live ? t("Going offline disconnects everyone.") : t("Go live to host it and invite friends.")}</div>
          </div>
          {live ? (
            <Button
              variant="secondary"
              onClick={() => {
                servers.goOffline();
                onClose();
              }}
            >
              <Power size={14} /> {t("Go offline")}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() =>
                void servers.goLive(server.id).then(
                  () => {
                    onLive();
                    onClose();
                  },
                  (e) => setErr(servers.errorText(e)),
                )
              }
            >
              <Radio size={14} /> {t("Go live")}
            </Button>
          )}
        </div>
        {err && <p className="text-sm text-red">{err}</p>}

        <div className="flex items-center gap-3 border-t border-line pt-5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-red">{t("Delete server")}</div>
            <div className="text-xs text-muted">{t("Removes its channels and chat history from this PC.")}</div>
          </div>
          <Button
            variant={confirm ? "danger" : "secondary"}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              void servers.remove(server.id).then(() => {
                onDeleted();
                onClose();
              });
            }}
          >
            <Trash2 size={14} /> {confirm ? t("Click again to delete") : t("Delete")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
