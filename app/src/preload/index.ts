import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  onSidecarEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on("sidecar-event", handler);
    return () => ipcRenderer.off("sidecar-event", handler);
  },
});
