import { contextBridge, ipcRenderer } from "electron";

/** The only surface the renderer gets: no Node, no fs, just these calls. */
const api = {
  platform: process.platform,
  host: {
    start: (serverId: string, port?: number) => ipcRenderer.invoke("host:start", serverId, port),
    stop: () => ipcRenderer.invoke("host:stop"),
    info: () => ipcRenderer.invoke("host:info"),
  },
  servers: {
    list: () => ipcRenderer.invoke("servers:list"),
    create: (name: string) => ipcRenderer.invoke("servers:create", name),
    update: (id: string, patch: unknown) => ipcRenderer.invoke("servers:update", id, patch),
    delete: (id: string) => ipcRenderer.invoke("servers:delete", id),
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
  update: {
    state: () => ipcRenderer.invoke("update:state"),
    check: () => ipcRenderer.invoke("update:check"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.send("update:install"),
    onState: (cb: (s: unknown) => void) => {
      const h = (_: unknown, s: unknown) => cb(s);
      ipcRenderer.on("update:state", h);
      return () => ipcRenderer.removeListener("update:state", h);
    },
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
