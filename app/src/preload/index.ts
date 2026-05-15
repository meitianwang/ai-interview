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
  onAnswerStart: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("answer-start", handler);
    return () => ipcRenderer.off("answer-start", handler);
  },
  onAnswerToken: (callback: (token: string) => void) => {
    const handler = (_: unknown, token: string) => callback(token);
    ipcRenderer.on("answer-token", handler);
    return () => ipcRenderer.off("answer-token", handler);
  },
  onAnswerDone: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("answer-done", handler);
    return () => ipcRenderer.off("answer-done", handler);
  },
});
