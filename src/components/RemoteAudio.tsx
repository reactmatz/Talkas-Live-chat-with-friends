import { useEffect, useRef } from "react";
import { useSession } from "../lib/session";
import { useSettings } from "../lib/settings";

/** Plays every remote voice and stream-audio track with per-user volume/mute, deafen and the chosen output device. */
export function RemoteAudio() {
  const s = useSession();
  const st = useSettings();
  return (
    <>
      {Object.entries(s.remote).flatMap(([id, r]) => {
        const name = s.members[id]?.name ?? "";
        const peer = st.peers[name] ?? { volume: 1, muted: false, streamVolume: 1 };
        const off = s.local.deafened || peer.muted;
        return [
          r.mic && <Player key={`${id}-mic`} stream={r.mic} muted={off} volume={peer.volume} sink={st.outputDevice} />,
          r.screenAudio && <Player key={`${id}-sa`} stream={r.screenAudio} muted={off} volume={peer.streamVolume} sink={st.outputDevice} />,
        ].filter(Boolean);
      })}
    </>
  );
}

function Player({ stream, muted, volume, sink }: { stream: MediaStream; muted: boolean; volume: number; sink: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    void ref.current.play().catch(() => {});
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    void el?.setSinkId?.(sink).catch(() => {}); // "" = system default
  }, [sink]);
  return <audio ref={ref} autoPlay muted={muted} />;
}
