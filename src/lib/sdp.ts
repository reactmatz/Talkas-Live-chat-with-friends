/**
 * SDP tweaks applied to every offer/answer.
 *
 * Opus is configured per audio m-line (they are always in slot order: mic first, screen audio second):
 *  - mic:          mono, in-band FEC (survives packet loss), DTX (no packets while silent), 64 kbps cap
 *  - screen audio: stereo music-grade, FEC, no DTX, 256 kbps cap (full-band: keeps the bass and the highs)
 */
const MIC = { useinbandfec: "1", usedtx: "1", stereo: "0", maxaveragebitrate: "64000", maxplaybackrate: "48000" };
const SCREEN = { useinbandfec: "1", usedtx: "0", stereo: "1", "sprop-stereo": "1", maxaveragebitrate: "256000", maxplaybackrate: "48000", cbr: "0" };

export function tuneOpus(sdp: string): string {
  const [head, ...sections] = sdp.split(/\r\nm=/);
  let audioIndex = 0;
  const tuned = sections.map((body) => {
    if (!body.startsWith("audio")) return body;
    const params = audioIndex++ === 0 ? MIC : SCREEN;
    const pt = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(body)?.[1];
    if (!pt) return body;
    const fmtp = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    const merge = (existing: string) => {
      const map = new Map(existing.split(";").filter(Boolean).map((kv) => kv.trim().split("=") as [string, string]));
      for (const [k, v] of Object.entries(params)) map.set(k, v);
      return [...map].map(([k, v]) => `${k}=${v}`).join(";");
    };
    return fmtp.test(body)
      ? body.replace(fmtp, (_, existing: string) => `a=fmtp:${pt} ${merge(existing)}`)
      : body.replace(new RegExp(`(a=rtpmap:${pt} [^\\r\\n]*)`), `$1\r\na=fmtp:${pt} ${merge("")}`);
  });
  return [head, ...tuned].join("\r\nm=");
}

/**
 * Codec order for the video transceivers. Hardware encoders (H.264, then AV1/VP9 where the GPU supports them)
 * keep CPU low and latency down at 60 fps; VP8 stays as the universal fallback.
 */
export function preferVideoCodecs(t: RTCRtpTransceiver) {
  const caps = RTCRtpSender.getCapabilities?.("video")?.codecs;
  if (!caps || !t.setCodecPreferences) return;
  const rank = (mime: string) => ["video/h264", "video/av1", "video/vp9", "video/vp8"].indexOf(mime.toLowerCase());
  const media = caps.filter((c) => rank(c.mimeType) >= 0).sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
  const rest = caps.filter((c) => rank(c.mimeType) < 0); // rtx, red, ulpfec must stay
  try {
    t.setCodecPreferences([...media, ...rest]);
  } catch {
    // some platforms reject certain profiles; default order still works
  }
}
