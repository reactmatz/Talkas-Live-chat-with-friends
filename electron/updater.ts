import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export type UpdateState =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "none"; version: string }
  | { state: "available"; version: string; next: string }
  | { state: "downloading"; version: string; next: string; percent: number }
  | { state: "ready"; version: string; next: string }
  | { state: "error"; version: string; message: string };

/**
 * "Update" button like Minehub: checks the GitHub Releases feed (latest.yml), downloads only when the
 * user clicks, and restarts into the new version. Never updates behind the user's back.
 */
export class Updater {
  private s: UpdateState = { state: "idle", version: app.getVersion() };

  constructor(private win: () => BrowserWindow | null) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    const v = app.getVersion();
    autoUpdater.on("checking-for-update", () => this.set({ state: "checking", version: v }));
    autoUpdater.on("update-available", (i) => this.set({ state: "available", version: v, next: i.version }));
    autoUpdater.on("update-not-available", () => this.set({ state: "none", version: v }));
    autoUpdater.on("download-progress", (p) => {
      const next = "next" in this.s ? this.s.next : "";
      this.set({ state: "downloading", version: v, next, percent: Math.round(p.percent) });
    });
    autoUpdater.on("update-downloaded", (i) => this.set({ state: "ready", version: v, next: i.version }));
    autoUpdater.on("error", (e) => this.set({ state: "error", version: v, message: friendly(e) }));
  }

  get state() {
    return this.s;
  }

  async check() {
    if (!app.isPackaged) return this.set({ state: "none", version: app.getVersion() }); // dev builds don't update
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      this.set({ state: "error", version: app.getVersion(), message: friendly(e) });
    }
    return this.s;
  }

  async download() {
    try {
      await autoUpdater.downloadUpdate();
    } catch (e) {
      this.set({ state: "error", version: app.getVersion(), message: friendly(e) });
    }
  }

  install() {
    if (this.s.state === "ready") autoUpdater.quitAndInstall(false, true);
  }

  private set(s: UpdateState) {
    this.s = s;
    this.win()?.webContents.send("update:state", s);
    return s;
  }
}

function friendly(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/404|401|403|authentication|private/i.test(msg)) return "update-feed-unreachable";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(msg)) return "offline";
  return msg.split("\n")[0].slice(0, 200);
}
