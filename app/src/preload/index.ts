import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  onSidecarEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on("sidecar-event", handler);
    return () => ipcRenderer.off("sidecar-event", handler);
  },
  onAudioLevel: (callback: (level: number) => void) => {
    const handler = (_: unknown, level: number) => callback(level);
    ipcRenderer.on("audio-level", handler);
    return () => ipcRenderer.off("audio-level", handler);
  },
  onTranscript: (callback: (transcript: string) => void) => {
    const handler = (_: unknown, transcript: string) => callback(transcript);
    ipcRenderer.on("transcript", handler);
    return () => ipcRenderer.off("transcript", handler);
  },
});
