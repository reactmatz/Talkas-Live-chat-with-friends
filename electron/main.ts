import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from "electron";
import { join } from "node:path";
import { DEFAULT_PORT } from "../shared/protocol";
import { checkTunnel, playitStatus, startPlayit } from "./playit";
import { SignalingServer } from "./signaling";

const DEV_URL = "http://localhost:5180";
const signaling = new SignalingServer();
let win: BrowserWindow | null = null;
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
  win.on("maximize", () => win?.webContents.send("window:state", { maximized: true }));
  win.on("unmaximize", () => win?.webContents.send("window:state", { maximized: false }));
  win.webContents.setWindowOpenHandler(({ url }) => {
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
  ipcMain.handle("host:start", async (_e, args: { name?: string; port?: number }) =>
    signaling.start({
      name: String(args?.name || "My Server").slice(0, 40),
      port: Number(args?.port) || DEFAULT_PORT,
      dataDir: join(app.getPath("userData"), "host"),
    }),
  );
  ipcMain.handle("host:stop", () => signaling.stop());
  ipcMain.handle("host:info", () => signaling.getInfo());

  ipcMain.handle("playit:status", () => playitStatus());
  ipcMain.handle("playit:start", () => startPlayit());
  ipcMain.handle("playit:check", (_e, address: string) => checkTunnel(String(address ?? "")));
  ipcMain.handle("open:external", (_e, url: string) => {
    if (/^https:\/\/(playit\.gg|github\.com)\//.test(String(url))) void shell.openExternal(url);
  });

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
}

app.on("second-instance", () => {
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.whenReady().then(() => {
  setupPermissions();
  setupIpc();
  createWindow();
});

app.on("before-quit", () => void signaling.stop());
app.on("window-all-closed", () => app.quit());
