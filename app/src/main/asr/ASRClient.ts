import { EventEmitter } from "node:events";

export interface TranscriptEvent {
  type: "partial" | "final";
  text: string;
  ts: number;
}

export interface ASRClient extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): void;
  pushAudio(pcm: Buffer): void;
}
