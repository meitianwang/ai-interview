export type SidecarEventType =
  | "ready"
  | "audio.chunk"
  | "ocr.result"
  | "hotkey.fired"
  | "screen-share.changed";

export type ElectronCommandType =
  | "capture.start"
  | "capture.stop"
  | "screenshot.request"
  | "window.set-stealth"
  | "ping";

export interface IpcMessage<T extends string, P> {
  v: 1;
  t: T;
  seq: number;
  ts: number;
  p: P;
}

export type SidecarEvent =
  | IpcMessage<"ready", { version: string }>
  | IpcMessage<"audio.chunk", { pcm_b64: string; sample_rate: 16000; channels: 1 }>
  | IpcMessage<"ocr.result", { text: string; boxes?: number[][] }>
  | IpcMessage<"hotkey.fired", { id: string }>
  | IpcMessage<"screen-share.changed", { active: boolean }>;

export type ElectronCommand =
  | IpcMessage<"capture.start", {}>
  | IpcMessage<"capture.stop", {}>
  | IpcMessage<"screenshot.request", { region?: { x: number; y: number; w: number; h: number } }>
  | IpcMessage<
      "window.set-stealth",
      { windowId: string; sharingType: "none" | "readOnly" | "readWrite" }
    >
  | IpcMessage<"ping", { token: string }>;
