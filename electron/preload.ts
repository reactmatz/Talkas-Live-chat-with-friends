import { contextBridge, ipcRenderer } from "electron";

/** The only surface the renderer gets: no Node, no fs, just these calls. */
const api = {
  platform: process.platform,
  host: {
    start: (name: string, port?: number) => ipcRenderer.invoke("host:start", { name, port }),
    stop: () => ipcRenderer.invoke("host:stop"),
    info: () => ipcRenderer.invoke("host:info"),
  },
  tunnel: {
    state: () => ipcRenderer.invoke("tunnel:state"),
    start: () => ipcRenderer.invoke("tunnel:start"),
    stop: () => ipcRenderer.invoke("tunnel:stop"),
    check: (address: string) => ipcRenderer.invoke("tunnel:check", address),
    onState: (cb: (s: unknown) => void) => {
      const h = (_: unknown, s: unknown) => cb(s);
      ipcRenderer.on("tunnel:state", h);
      return () => ipcRenderer.removeListener("tunnel:state", h);
    },
  },
  screen: {
    sources: () => ipcRenderer.invoke("screen:sources"),
    select: (id: string, audio: boolean) => ipcRenderer.invoke("screen:select", id, audio),
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    onState: (cb: (s: { maximized: boolean }) => void) => {
      const h = (_: unknown, s: { maximized: boolean }) => cb(s);
      ipcRenderer.on("window:state", h);
      return () => ipcRenderer.removeListener("window:state", h);
    },
  },
};

contextBridge.exposeInMainWorld("talkas", api);
