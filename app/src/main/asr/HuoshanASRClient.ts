import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { ASRClient, TranscriptEvent } from "./ASRClient";

export interface HuoshanConfig {
  url: string;
  appId: string;
  token: string;
  sampleRate: 16_000;
  language: "zh-CN";
}

export class HuoshanASRClient extends EventEmitter implements ASRClient {
  private ws: WebSocket | null = null;

  constructor(private readonly config: HuoshanConfig) {
    super();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.url, {
        headers: { Authorization: `Bearer; ${this.config.token}` },
      });
      let settled = false;

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            app: {
              appid: this.config.appId,
              cluster: "volcengine_streaming_common",
            },
            user: { uid: "ai-interview" },
            audio: {
              bits: 16,
              channel: 1,
              codec: "raw",
              format: "pcm",
              rate: this.config.sampleRate,
            },
            request: {
              reqid: cryptoId(),
              result_type: "single",
              workflow: "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
            },
          }),
        );
        settled = true;
        resolve();
      });
      ws.on("message", (data) => this.handleMessage(data.toString()));
      ws.on("error", (error) => {
        if (!settled) {
          reject(error);
          return;
        }
        this.emit("error", error);
      });
      ws.on("close", () => this.emit("close"));
      this.ws = ws;
    });
  }

  pushAudio(pcm: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcm);
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw);
      const result = Array.isArray(message.result) ? message.result[0] : message.result?.[0];
      if (!result?.text) {
        return;
      }

      const event: TranscriptEvent = {
        type: result.isFinal === true ? "final" : "partial",
        text: result.text,
        ts: Date.now(),
      };
      this.emit("transcript", event);
    } catch {
      // Provider heartbeat/control frames can be non-JSON or schema-incompatible.
    }
  }
}

function cryptoId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
