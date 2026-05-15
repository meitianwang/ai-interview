import { EventEmitter } from "node:events";
import type { ASRClient } from "./ASRClient";

export interface MockScriptItem {
  afterMs: number;
  type: "partial" | "final";
  text: string;
}

export class MockASRClient extends EventEmitter implements ASRClient {
  private timers: NodeJS.Timeout[] = [];
  private started = false;

  constructor(private readonly options: { script: MockScriptItem[] }) {
    super();
  }

  async connect(): Promise<void> {}

  pushAudio(_pcm: Buffer): void {
    if (this.started) {
      return;
    }

    this.started = true;
    for (const item of this.options.script) {
      const timer = setTimeout(() => {
        this.emit("transcript", {
          type: item.type,
          text: item.text,
          ts: Date.now(),
        });
      }, item.afterMs);
      this.timers.push(timer);
    }
  }

  disconnect(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    this.started = false;
  }
}
