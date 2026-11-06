import { useEffect, useState } from "react";
import type { Channel } from "../shared/protocol";
import { ConnectScreen } from "./components/ConnectScreen";
import { InviteModal } from "./components/InviteModal";
import { RemoteAudio } from "./components/RemoteAudio";
import { ScreenPicker } from "./components/ScreenPicker";
import { ChannelSidebar, ServerRail } from "./components/Sidebar";
import { TextChannel } from "./components/TextChannel";
import { TitleBar } from "./components/ui";
import { VoiceStage } from "./components/VoiceStage";
import { native, type HostInfo } from "./lib/native";
import { session, useSession } from "./lib/session";
import { useSettings } from "./lib/settings";
import { SettingsPage } from "./components/SettingsPage";

export default function App() {
  const s = useSession();
  const [host, setHost] = useState<HostInfo | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [invite, setInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { zoom } = useSettings();

  // Appearance → zoom level (Chromium CSS zoom scales the whole UI, including hit-testing).
  useEffect(() => {
    document.documentElement.style.zoom = String(zoom);
  }, [zoom]);

  // Pick the first text channel once the server is known.
  useEffect(() => {
    if (s.server && !s.server.channels.some((c) => c.id === channelId)) setChannelId(s.server.channels.find((c) => c.kind === "text")?.id ?? null);
  }, [s.server, channelId]);

  // Error toast auto-dismiss.
  useEffect(() => {
    if (!s.error || !s.server) return;
    const t = setTimeout(() => session.clearError(), 5_000);
    return () => clearTimeout(t);
  }, [s.error, s.server]);

  const leave = async () => {
    session.disconnect();
    if (host) await native?.host.stop();
    setHost(null);
  };

  const channel = s.server?.channels.find((c) => c.id === channelId) ?? null;
  const select = (c: Channel) => {
    setChannelId(c.id);
    if (c.kind === "voice" && s.voiceChannel !== c.id) void session.joinVoice(c.id);
  };

  const connected = !!s.server && s.status !== "idle";
  return (
    <div className="flex h-full flex-col">
      <TitleBar title={s.server ? `Talkas — ${s.server.name}` : "Talkas"} />
      {!connected ? (
        <ConnectScreen onHosted={setHost} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ServerRail onLeave={() => void leave()} />
          <ChannelSidebar selected={channelId} onSelect={select} host={host} onInvite={() => setInvite(true)} onShare={() => setPicker(true)} onSettings={() => setShowSettings(true)} />
          <main className="flex min-w-0 flex-1 flex-col">
            {s.status !== "open" && <div className="bg-amber/15 px-4 py-1.5 text-center text-xs text-amber">Connection to the server lost — reconnecting…</div>}
            {channel?.kind === "text" && <TextChannel channel={channel} />}
            {channel?.kind === "voice" && <VoiceStage channel={channel} onShare={() => setPicker(true)} pickerOpen={picker} />}
          </main>
        </div>
      )}
      <RemoteAudio />
      {picker && <ScreenPicker onClose={() => setPicker(false)} />}
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {invite && host && <InviteModal host={host} onClose={() => setInvite(false)} />}
      {s.error && s.server && <div className="animate-pop fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red/40 bg-panel px-4 py-2.5 text-sm shadow-xl">{s.error}</div>}
    </div>
  );
}
