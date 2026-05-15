import { EventEmitter } from "node:events";
import type { ASRClient, TranscriptEvent } from "./ASRClient";

interface CurrentClient {
  client: ASRClient;
  onClose: () => void;
  onError: (error: unknown) => void;
  onTranscript: (event: TranscriptEvent) => void;
}

export class AutoReconnectASR extends EventEmitter implements ASRClient {
  private current: CurrentClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private retries = 0;
  private stopped = false;

  constructor(
    private readonly factory: () => ASRClient,
    private readonly opts: { maxRetries: number; delayMs: number },
  ) {
    super();
  }

  async connect(): Promise<void> {
    this.stopped = false;
    this.clearReconnectTimer();
    this.detachCurrent();

    const client = this.factory();
    const current: CurrentClient = {
      client,
      onClose: () => this.scheduleReconnect(),
      onError: (error) => {
        this.emitError(error);
        this.scheduleReconnect();
      },
      onTranscript: (event) => this.emit("transcript", event),
    };

    client.on("transcript", current.onTranscript);
    client.once("close", current.onClose);
    client.on("error", current.onError);
    this.current = current;

    try {
      await client.connect();
      if (this.current === current && !this.stopped) {
        this.retries = 0;
        this.emit("connected");
      }
    } catch (error) {
      if (this.current === current && !this.stopped) {
        this.emitError(error);
        this.scheduleReconnect();
      }
    }
  }

  pushAudio(pcm: Buffer): void {
    this.current?.client.pushAudio(pcm);
  }

  disconnect(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    const current = this.current;
    this.detachCurrent();
    current?.client.disconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.detachCurrent();
    if (this.retries >= this.opts.maxRetries) {
      this.emit("failed");
      return;
    }

    this.retries += 1;
    this.emit("reconnecting", this.retries);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        this.emitError(error);
        this.scheduleReconnect();
      });
    }, this.opts.delayMs);
  }

  private detachCurrent(): void {
    if (!this.current) {
      return;
    }

    const { client, onClose, onError, onTranscript } = this.current;
    client.off("transcript", onTranscript);
    client.off("close", onClose);
    client.off("error", onError);
    this.current = null;
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private emitError(error: unknown): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
    }
  }
}
