import { Settings as Cog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Channel } from "../shared/protocol";
import logo from "./assets/talkas-symbol.svg";
import { ConnectModal } from "./components/ConnectScreen";
import { InviteModal } from "./components/InviteModal";
import { RemoteAudio } from "./components/RemoteAudio";
import { ScreenPicker } from "./components/ScreenPicker";
import { OfflineServer, ServerSettingsModal } from "./components/ServerViews";
import { SettingsPage } from "./components/SettingsPage";
import { ChannelSidebar, ServerRail, type View } from "./components/Sidebar";
import { TextChannel } from "./components/TextChannel";
import { Button, TitleBar } from "./components/ui";
import { VoiceStage } from "./components/VoiceStage";
import { useT } from "./lib/i18n";
import { native } from "./lib/native";
import { servers, useServers } from "./lib/servers";
import { session, useSession } from "./lib/session";
import { useSettings } from "./lib/settings";

export default function App() {
  const t = useT();
  const s = useSession();
  const { list, host } = useServers();
  const [view, setView] = useState<View>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [invite, setInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverSettings, setServerSettings] = useState(false);
  const [connect, setConnect] = useState<"create" | "join" | null>(null);
  const { zoom } = useSettings();

  // Appearance → zoom level (Chromium CSS zoom scales the whole UI, including hit-testing).
  useEffect(() => {
    document.documentElement.style.zoom = String(zoom);
  }, [zoom]);

  // First launch: open on your first saved server, or the create/join window if you have none.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (booted) return;
    const t = setTimeout(() => {
      setBooted(true);
      const first = servers.get().list[0];
      if (first) setView({ type: "saved", id: first.id });
      else setConnect(native ? "create" : "join");
    }, 150); // give the saved-server list a moment to load
    return () => clearTimeout(t);
  }, [booted]);

  const saved = view?.type === "saved" ? (list.find((x) => x.id === view.id) ?? null) : null;
  const live = !!saved && host?.serverId === saved.id && s.server?.id === saved.id && s.status !== "idle";
  const remoteConnected = view?.type === "remote" && !!s.server && s.status !== "idle";
  const server = live || remoteConnected ? s.server : saved ? { id: saved.id, name: saved.name, channels: saved.channels } : null;

  // Keep a valid channel selected.
  useEffect(() => {
    if (server && !server.channels.some((c) => c.id === channelId)) setChannelId(server.channels.find((c) => c.kind === "text")?.id ?? server.channels[0]?.id ?? null);
  }, [server, channelId]);

  // Error toast auto-dismiss.
  useEffect(() => {
    if (!s.error || !s.server) return;
    const id = setTimeout(() => session.clearError(), 5_000);
    return () => clearTimeout(id);
  }, [s.error, s.server]);

  // If the remote server goes away, fall back to your first server.
  useEffect(() => {
    if (view?.type === "remote" && s.status === "idle") setView(list[0] ? { type: "saved", id: list[0].id } : null);
  }, [view, s.status, list]);

  const leave = () => {
    if (host) servers.goOffline();
    else session.disconnect();
  };

  const channel = server?.channels.find((c) => c.id === channelId) ?? null;
  const select = (c: Channel) => {
    setChannelId(c.id);
    if ((live || remoteConnected) && c.kind === "voice" && s.voiceChannel !== c.id) void session.joinVoice(c.id);
  };

  const onJoined = useCallback(() => setView({ type: "remote" }), []);
  const onCreated = useCallback((id: string) => setView({ type: "saved", id }), []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar title={server ? `Talkas — ${server.name}` : "Talkas"} />
      <div className="flex min-h-0 flex-1">
        <ServerRail view={view} onView={setView} onAdd={() => setConnect(native ? "create" : "join")} onLeave={leave} />
        {server ? (
          <>
            <ChannelSidebar
              server={server}
              saved={saved}
              live={live || remoteConnected}
              selected={channelId}
              onSelect={select}
              onInvite={() => setInvite(true)}
              onShare={() => setPicker(true)}
              onSettings={() => setShowSettings(true)}
              onServerSettings={() => setServerSettings(true)}
            />
            {live || remoteConnected ? (
              <main className="flex min-w-0 flex-1 flex-col">
                {s.status !== "open" && <div className="bg-amber/15 px-4 py-1.5 text-center text-xs text-amber">{t("Connection to the server lost — reconnecting…")}</div>}
                {channel?.kind === "text" && <TextChannel channel={channel} />}
                {channel?.kind === "voice" && <VoiceStage channel={channel} onShare={() => setPicker(true)} pickerOpen={picker} />}
              </main>
            ) : (
              saved && <OfflineServer server={saved} onLive={() => undefined} />
            )}
          </>
        ) : (
          <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-panel p-8 text-center">
            <img src={logo} alt="" className="size-16" draggable={false} />
            <div>
              <h1 className="text-xl font-bold">{t("You're not in a server")}</h1>
              <p className="mt-1 text-sm text-fg2">{t("Create your own server or join a friend's with their invite.")}</p>
            </div>
            <div className="flex gap-2">
              {native && (
                <Button variant="primary" onClick={() => setConnect("create")}>
                  {t("Create a server")}
                </Button>
              )}
              <Button onClick={() => setConnect("join")}>{t("Join a friend")}</Button>
              <Button variant="ghost" onClick={() => setShowSettings(true)}>
                <Cog size={15} /> {t("Settings")}
              </Button>
            </div>
          </main>
        )}
      </div>
      <RemoteAudio />
      {picker && <ScreenPicker onClose={() => setPicker(false)} />}
      {connect && <ConnectModal key={connect} initialMode={connect} onCreated={onCreated} onJoined={onJoined} onClose={() => setConnect(null)} />}
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {serverSettings && saved && (
        <ServerSettingsModal
          server={saved}
          onClose={() => setServerSettings(false)}
          onLive={() => undefined}
          onDeleted={() => {
            const next = list.find((x) => x.id !== saved.id);
            setView(next ? { type: "saved", id: next.id } : null);
          }}
        />
      )}
      {invite && host && <InviteModal host={host} onClose={() => setInvite(false)} />}
      {s.error && s.server && <div className="animate-pop fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red/40 bg-panel px-4 py-2.5 text-sm shadow-xl">{s.error}</div>}
    </div>
  );
}
