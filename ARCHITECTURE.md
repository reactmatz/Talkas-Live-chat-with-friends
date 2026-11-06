# Talkas — Architecture

Self-hosted, offline-first voice/video/screen-sharing app with a Discord-like UI.
**Electron + React 19 + TypeScript + Tailwind 4.** Media is 100 % peer to peer (WebRTC full mesh);
the only server is a tiny signaling/presence process that runs *inside the host's app*.

## 1. Components

```
┌──────────────────────── Host PC (Electron) ────────────────────────┐
│ main process                                                      │
│  ├─ SignalingServer  (ws://0.0.0.0:4646/signal)   electron/signaling.ts
│  │    presence · voice rooms · chat history · SDP/ICE relay        │
│  ├─ desktopCapturer + setDisplayMediaRequestHandler (screen/loopback audio)
│  └─ IPC (preload, contextIsolation, sandbox)                       │
│ renderer (React)                                                  │
│  ├─ SignalingClient  ──────────── WebSocket ──────────────┐        │
│  └─ PeerMesh (RTCPeerConnection × N) ◀══ RTP/SRTP (P2P) ══╪══▶ peers
└──────────────────────────────────────────────────────────┼────────┘
                                                           │
┌──────────── Guest PC (Electron) ─────────────┐           │
│ renderer: SignalingClient ───────────────────┼───────────┘
│           PeerMesh ◀══════════ RTP/SRTP direct to every other peer ══▶
└──────────────────────────────────────────────┘
```

| Concern | Where | Notes |
|---|---|---|
| Wire protocol | `shared/protocol.ts` | Typed JSON messages, shared by server and client |
| Signaling + presence + text chat | `electron/signaling.ts` | Invite key auth (timing-safe), rate limit, heartbeat, relays only within the same voice room |
| Screen sources | `electron/main.ts` | Renderer picks a source → `screen:select` → `getDisplayMedia()` is resolved by `setDisplayMediaRequestHandler` (+ `audio: "loopback"` on Windows) |
| Peer connections | `src/lib/mesh.ts` | Full mesh, 4 pre-negotiated slots, deterministic offerer, ICE restart |
| SDP tuning | `src/lib/sdp.ts` | Opus per m-line, video codec preference |
| Session store | `src/lib/session.ts` | Signaling + mesh + devices as a `useSyncExternalStore` store |
| Immersive stage | `src/components/VoiceStage.tsx`, `src/lib/useIdle.ts`, `src/lib/useFullscreen.ts` | Fullscreen, 3 s auto-hide |

## 2. P2P connection workflow, step by step

1. **Host starts a server.** The host's main process opens `ws://0.0.0.0:4646/signal` and creates an
   8-char invite key. The host's own renderer connects to `127.0.0.1` like any guest.
2. **Guests join.** They paste an invite: a LAN address (`192.168.x.x:4646#KEY`) or an internet link
   (`wss://….trycloudflare.com#KEY`) created by `electron/cloudflare.ts` — a Cloudflare Quick Tunnel that
   forwards the WebSocket to the host without exposing its IP. The host's own window also sends a secret
   host token (never by IP: through the tunnel every guest arrives from 127.0.0.1). First message: `hello {key, name, hue}`. Wrong key → close `4003`.
3. **Welcome.** The server answers with `welcome {selfId, server, members, voice, history}` and broadcasts
   `member_join`. Text chat goes through this socket and is stored on the host (last 200 per channel).
4. **Join a voice room.** The client captures the mic (`echoCancellation`, `noiseSuppression`,
   `autoGainControl`, mono, 48 kHz) and sends `join_voice`. The server broadcasts the new room map (`voice`).
5. **Mesh sync.** Every client in the room calls `PeerMesh.sync(roomMembers)`: one `RTCPeerConnection` per
   other member (`bundlePolicy: max-bundle`).
6. **Deterministic roles (no glare).** For each pair, the peer with the **smaller id is the offerer**.
   Only the offerer ever creates offers (initial and ICE restarts); the other side only answers.
7. **Pre-negotiated slots.** The offerer adds four `sendrecv` transceivers in a fixed order:
   `mic (audio) · camera (video) · screen (video) · screenAudio (audio)`, sets codec preferences on the
   video ones, and sends the offer. The answerer's transceivers are created by `setRemoteDescription`
   in the same order, so slot = m-line index on both sides.
8. **SDP tuning.** Before `setLocalDescription`, `tuneOpus()` rewrites each audio m-line:
   mic → mono, FEC, **DTX**, 64 kbps; screen audio → **stereo**, FEC, no DTX, 160 kbps.
9. **ICE.** Candidates are relayed through the server (`signal {to, data}`), queued until the remote
   description exists. On the LAN, host candidates connect directly. Over the internet, a public **STUN**
   server is used only to discover public addresses (no media through it).
10. **Media flows peer to peer.** `ontrack` maps each incoming track to its slot by transceiver index.
    The server is now out of the media path.
11. **Camera / screen share = `replaceTrack`.** Turning a stream on or off just swaps the track in the
    pre-negotiated sender: **no renegotiation, no SDP round trip**, the first frame goes out immediately.
    Then `setParameters()` applies the encoder settings (below). The other members learn *what* is live
    from `state {camera, sharing}` broadcasts; the frames themselves never touch the server.
12. **Recovery.** `connectionState === "failed"` → offerer calls `restartIce()` (answerer asks for it with
    `{restart:true}`). If the signaling socket drops, the client reconnects with exponential backoff.
13. **Leave.** `leave_voice` → the room map changes → `sync()` closes the affected connections.

## 3. Screen-share performance

- **Capture**: Electron `desktopCapturer` source + `getDisplayMedia({ frameRate, height })`, then
  `applyConstraints` to lock fps. `contentHint = "motion"` (games/video) or `"detail"` (text/code).
- **Encoder** (`RTCRtpSender.setParameters`): `maxBitrate` per preset (4–14 Mbps), `maxFramerate` 60,
  `scaleResolutionDownBy: 1`, `priority/networkPriority: high`,
  `degradationPreference: "maintain-framerate"` (motion) or `"maintain-resolution"` (detail) — under
  congestion it drops resolution, not frames.
- **Codecs**: H.264 first (hardware encoders on most GPUs → low CPU, low latency), then AV1, VP9, VP8.
- **Electron switches**: no renderer backgrounding / timer throttling, so a minimized sharer keeps 60 fps.
- **Presets**: 720p60, 1080p60, 1440p60, 1080p "text & code" (15 fps, sharp).
- **Mesh trade-off**: each viewer receives its own encoded copy (upload × viewers). Comfortable for
  ~2–6 people at 1080p60 on a typical upload link. Beyond that, the next step is simulcast or electing a
  peer as an SFU-style forwarder — still self-hosted, still no central media server.

## 4. Immersive fullscreen & auto-hide

- **Fullscreen**: clicking a live stream focuses it and calls `requestFullscreen()` on the stage
  (`useFullscreen`). In Electron, element fullscreen makes the frameless window truly borderless
  fullscreen. `F` toggles, `Esc` exits, double-click a tile toggles.
- **Idle timer** (`useIdle(stage, 3000, enabled)`): listens to `pointermove`, `pointerdown`, `wheel`,
  `touchstart` on the stage and `keydown` on the window. After 3 s without activity → `idle = true`.
  Leaving the window also counts as idle.
- **Effect when idle**: stage gets `cursor: none` (also forced on children), the floating control bar,
  participant strip and name labels fade to 0 opacity over 500 ms and stop receiving clicks.
- **Wake**: any movement sets `idle = false` and the chrome returns with a 75 ms transition (instant).
- **Never hides while** the pointer is over the toolbar or the screen picker is open.

## 5. Security notes

- Renderer has no Node access (`contextIsolation`, `sandbox`, minimal preload API).
- Invite key compared with `timingSafeEqual`; 5 s to say hello; messages capped at 256 KB (`maxPayload`);
  per-socket rate limit; signals relayed only between members of the same voice room.
- WebRTC media is always encrypted (DTLS-SRTP).
- The signaling port is plain `ws://` on the LAN. For internet use, put it behind a TLS tunnel (`wss://`)
  — the client accepts `wss://` addresses.

## 6. Limits / next steps

- Strict symmetric NATs on both ends can't connect without a TURN relay. A self-hosted TURN (coturn) on
  the host would keep things self-hosted but relays media through the host — opt-in only.
- Device selection (mic/speaker/camera), push-to-talk and per-user volume.
- Multiple servers in the rail (remember past servers).
