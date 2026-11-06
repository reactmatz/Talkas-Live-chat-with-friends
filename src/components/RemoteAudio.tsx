import { useEffect, useRef } from "react";
import { useSession } from "../lib/session";

/** Plays every remote voice and stream-audio track. Deafen mutes them all locally. */
export function RemoteAudio() {
  const s = useSession();
  return (
    <>
      {Object.entries(s.remote).flatMap(([id, r]) =>
        [r.mic && <Player key={`${id}-mic`} stream={r.mic} muted={s.local.deafened} />, r.screenAudio && <Player key={`${id}-sa`} stream={r.screenAudio} muted={s.local.deafened} />].filter(Boolean),
      )}
    </>
  );
}

function Player({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    void ref.current.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay muted={muted} />;
}
