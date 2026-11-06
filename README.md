# Talkas

Self-hosted, offline-first voice chat, video and screen sharing with a Discord-like interface.
Everything is **peer to peer** (WebRTC): voice, webcam and screen go straight between computers. The only
server is a tiny signaling process that runs inside the host's app.

**Stack:** Electron · React 19 · TypeScript · Tailwind CSS 4 · WebRTC · `ws`

## Download

Get **`Talkas-Setup-x.y.z.exe`** from the [latest release](https://github.com/reactmatz/Talkas-Live-chat-with-friends/releases/latest),
run it and follow the wizard. Windows may warn that the app is unrecognized (it isn't code-signed yet):
**More info → Run anyway**.

## Run from source

```bash
npm install
npm run dev      # Vite (5180) + Electron with hot reload
npm run dist     # installer for the current OS (electron-builder) → release/

# publish a new version on GitHub Releases
git tag v0.1.1 && git push origin v0.1.1
```

1. One friend clicks **Host a server** → gets an **invite code** (user-plus icon next to the server name).
2. Others click **Join a friend** → host's address (`192.168.x.x:4646` on the same Wi-Fi) + invite code.
3. Click a voice channel to join. **Screen** → pick a screen/window, quality and system audio → **Go Live**.
4. Click a live stream to watch it fullscreen. The cursor and controls hide after 3 s; move the mouse to
   bring them back. `F` toggles fullscreen.

### Over the internet (Cloudflare link)

On the host: user-plus icon → **Invite friends** → **Create internet link**. Talkas downloads Cloudflare's
official `cloudflared` the first time, opens a free Quick Tunnel and gives you an invite like
`wss://some-words.trycloudflare.com#A1B2C3D4`. Friends paste it into **Join a friend**.

No account, no router setup, and friends never see your IP during the handshake. The link changes every
time you start hosting. Voice and video still connect peer to peer.

Same Wi-Fi: share the LAN invite (`192.168.x.x:4646#CODE`) instead.

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
