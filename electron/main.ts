import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from "electron";
import { join } from "node:path";
import { DEFAULT_PORT } from "../shared/protocol";
import { checkPublicAddress, QuickTunnel } from "./cloudflare";
import { ServerStore } from "./servers";
import { SignalingServer } from "./signaling";
import { Updater } from "./updater";

const DEV_URL = "http://localhost:5180";
const signaling = new SignalingServer();
const tunnel = new QuickTunnel(join(app.getPath("userData"), "bin"), (s) => win?.webContents.send("tunnel:state", s));
let win: BrowserWindow | null = null;
const updater = new Updater(() => win);
let pendingSourceId: string | null = null; // chosen in the renderer's screen picker
let pendingAudio = false;

// Media pipeline tuning for low-latency screen sharing.
app.commandLine.appendSwitch("enable-features", "WebRtcAllowInputVolumeAdjustment,WebRTCPipeWireCapturer");
app.commandLine.appendSwitch("disable-renderer-backgrounding"); // keep encoding at full rate when minimized
app.commandLine.appendSwitch("disable-background-timer-throttling");

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    frame: false, // custom title bar; fullscreen stage is fully borderless
    backgroundColor: "#0D0E11",
    // Packaged builds take the icon from the .exe (build/icon.ico); dev uses the PNG.
    icon: app.isPackaged ? undefined : join(__dirname, "../../build/icon.png"),
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.once("ready-to-show", () => win?.show());
  // Pop-out windows belong to the main window: closing Talkas closes them too.
  win.on("close", () => BrowserWindow.getAllWindows().forEach((w) => w !== win && w.destroy()));
  win.on("maximize", () => win?.webContents.send("window:state", { maximized: true }));
  win.on("unmaximize", () => win?.webContents.send("window:state", { maximized: false }));
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Popped-out camera/stream: a plain window the renderer fills itself, so it can live on another monitor.
    if (url === "about:blank" && frameName.startsWith("talkas-pop-"))
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 640,
          height: 360,
          minWidth: 200,
          minHeight: 120,
          autoHideMenuBar: true,
          backgroundColor: "#0D0E11",
          icon: app.isPackaged ? undefined : join(__dirname, "../../build/icon.png"),
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
        },
      };
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (app.isPackaged) void win.loadFile(join(__dirname, "../../dist/index.html"));
  else void win.loadURL(DEV_URL);
}

function setupPermissions() {
  const allowed = new Set(["media", "display-capture", "fullscreen", "clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // getDisplayMedia() in the renderer lands here. The renderer first shows its own picker
  // (screen:sources) and tells us which source to use (screen:select).
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      const source = sources.find((s) => s.id === pendingSourceId);
      pendingSourceId = null;
      if (!source) return callback({});
      // "loopback" = system audio (Windows; on macOS it needs a virtual audio device).
      callback(pendingAudio && process.platform === "win32" ? { video: source, audio: "loopback" } : { video: source });
    },
    { useSystemPicker: false },
  );
}

function setupIpc() {
  const servers = new ServerStore(join(app.getPath("userData"), "servers.json"));
  ipcMain.handle("servers:list", () => servers.list());
  ipcMain.handle("servers:create", (_e, name: string) => servers.create(String(name ?? "")));
  ipcMain.handle("servers:update", (_e, id: string, patch: { name?: string; channels?: unknown }) => {
    const saved = servers.update(String(id), { name: patch?.name, channels: patch?.channels as never });
    signaling.updateServer(saved); // pushes the change to everyone if this server is live
    return saved;
  });
  ipcMain.handle("servers:delete", async (_e, id: string) => {
    if (signaling.getInfo().serverId === id) {
      tunnel.stop();
      await signaling.stop();
    }
    servers.delete(String(id));
  });

  // "Go live": host one of your saved servers from this PC.
  ipcMain.handle("host:start", async (_e, serverId: string, port?: number) => {
    const saved = servers.get(String(serverId));
    if (!saved) throw new Error("Server not found.");
    tunnel.stop(); // a new session gets a new internet link
    return signaling.start({
      server: saved,
      port: Number(port) || DEFAULT_PORT,
      dataDir: join(app.getPath("userData"), "host", saved.id),
    });
  });
  ipcMain.handle("host:stop", () => {
    tunnel.stop();
    return signaling.stop();
  });
  ipcMain.handle("host:info", () => signaling.getInfo());

  ipcMain.handle("tunnel:state", () => tunnel.state);
  ipcMain.handle("tunnel:start", () => {
    const info = signaling.getInfo();
    return info.running ? tunnel.start(info.port) : { state: "error", message: "Start hosting first." };
  });
  ipcMain.handle("tunnel:stop", () => tunnel.stop());
  ipcMain.handle("tunnel:check", (_e, address: string) => checkPublicAddress(String(address ?? "")));

  ipcMain.handle("screen:sources", async () => {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith("screen") ? "screen" : "window",
      thumbnail: s.thumbnail.toDataURL(),
      icon: s.appIcon?.toDataURL() ?? null,
    }));
  });
  ipcMain.handle("screen:select", (_e, id: string, audio: boolean) => {
    pendingSourceId = String(id);
    pendingAudio = !!audio;
  });

  ipcMain.on("window:minimize", () => win?.minimize());
  ipcMain.on("window:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.handle("window:isMaximized", () => win?.isMaximized() ?? false);
  ipcMain.on("window:close", () => win?.close());

  ipcMain.handle("update:state", () => updater.state);
  ipcMain.handle("update:check", () => updater.check());
  ipcMain.handle("update:download", () => updater.download());
  ipcMain.on("update:install", () => updater.install());
}

app.on("second-instance", () => {
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.whenReady().then(() => {
  setupPermissions();
  setupIpc();
  createWindow();
  // Quiet check a few seconds after start; the title bar shows a button only if there is something new.
  setTimeout(() => void updater.check(), 8_000);
});

app.on("before-quit", () => {
  tunnel.stop();
  void signaling.stop();
});
app.on("window-all-closed", () => app.quit());
