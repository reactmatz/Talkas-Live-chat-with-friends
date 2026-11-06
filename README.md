# Talkas

Self-hosted, offline-first voice chat, video and screen sharing with a Discord-like interface.
Everything is **peer to peer** (WebRTC): voice, webcam and screen go straight between computers. The only
server is a tiny signaling process that runs inside the host's app.

**Stack:** Electron · React 19 · TypeScript · Tailwind CSS 4 · WebRTC · `ws`

## Run

```bash
npm install
npm run dev      # Vite (5180) + Electron with hot reload
npm run dist     # installer for the current OS (electron-builder)
```

1. One friend clicks **Host a server** → gets an **invite code** (user-plus icon next to the server name).
2. Others click **Join a friend** → host's address (`192.168.x.x:4646` on the same Wi-Fi) + invite code.
3. Click a voice channel to join. **Screen** → pick a screen/window, quality and system audio → **Go Live**.
4. Click a live stream to watch it fullscreen. The cursor and controls hide after 3 s; move the mouse to
   bring them back. `F` toggles fullscreen.

### Over the internet with playit.gg

1. Install the [playit.gg agent](https://playit.gg/download) on the host PC and create a **TCP** tunnel whose
   local address is `127.0.0.1:4646`.
2. In Talkas: user-plus icon → **Invite friends** → paste the tunnel address (e.g. `name.tun.ply.gg:13157`).
   Talkas shows whether the agent is running (and can start it) and tests the tunnel end to end.
3. Copy the **Invite** (`address#CODE`). Friends paste it into **Join a friend**; the code fills in by itself.

Only the small signaling socket uses the tunnel — voice and video still connect peer to peer.
Direct IP + code (same Wi-Fi or a forwarded port) keeps working as before.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) — step-by-step P2P workflow, screen-share tuning and the
fullscreen/auto-hide design.

```
electron/
  main.ts         window, permissions, screen capture handler, IPC
  preload.ts      minimal API for the renderer
  signaling.ts    signaling + presence + chat server (runs on the host)
shared/
  protocol.ts     typed messages shared by server and client
src/
  lib/session.ts  store: signaling + mesh + devices
  lib/mesh.ts     WebRTC full mesh, slots, encoder tuning
  lib/sdp.ts      Opus + codec preferences
  lib/useIdle.ts  3 s mouse-inactivity detector
  components/     Sidebar, TextChannel, VoiceStage, ScreenPicker, ConnectScreen…
```
