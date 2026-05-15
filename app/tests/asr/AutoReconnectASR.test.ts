import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoReconnectASR } from "../../src/main/asr/AutoReconnectASR";
import type { ASRClient } from "../../src/main/asr/ASRClient";

class FakeASRClient extends EventEmitter implements ASRClient {
  connectCalls = 0;
  disconnected = false;
  pushed: Buffer[] = [];

  constructor(private readonly shouldFailConnect = false) {
    super();
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.shouldFailConnect) {
      throw new Error("connect failed");
    }
  }

  disconnect(): void {
    this.disconnected = true;
  }

  pushAudio(pcm: Buffer): void {
    this.pushed.push(pcm);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutoReconnectASR", () => {
  it("registers listeners before connecting and proxies transcripts", async () => {
    const client = new FakeASRClient();
    const asr = new AutoReconnectASR(() => client, { delayMs: 10, maxRetries: 1 });
    const transcripts: unknown[] = [];
    asr.on("transcript", (event) => transcripts.push(event));

    await asr.connect();
    client.emit("transcript", { text: "hello", ts: 1, type: "final" });
    asr.pushAudio(Buffer.from([1, 2]));

    expect(transcripts).toEqual([{ text: "hello", ts: 1, type: "final" }]);
    expect(client.pushed).toEqual([Buffer.from([1, 2])]);
  });

  it("reconnects after close", async () => {
    const clients: FakeASRClient[] = [];
    const asr = new AutoReconnectASR(
      () => {
        const client = new FakeASRClient();
        clients.push(client);
        return client;
      },
      { delayMs: 10, maxRetries: 2 },
    );
    const reconnecting: number[] = [];
    asr.on("reconnecting", (retry) => reconnecting.push(retry));

    await asr.connect();
    clients[0].emit("close");
    await vi.advanceTimersByTimeAsync(10);

    expect(reconnecting).toEqual([1]);
    expect(clients).toHaveLength(2);
    expect(clients[0].listenerCount("close")).toBe(0);
    expect(clients[1].connectCalls).toBe(1);
  });

  it("emits failed after max retries", async () => {
    const asr = new AutoReconnectASR(() => new FakeASRClient(true), { delayMs: 10, maxRetries: 1 });
    let failed = 0;
    asr.on("error", () => undefined);
    asr.on("failed", () => {
      failed += 1;
    });

    await asr.connect();
    await vi.advanceTimersByTimeAsync(10);

    expect(failed).toBe(1);
  });

  it("clears pending reconnect on disconnect", async () => {
    const clients: FakeASRClient[] = [];
    const asr = new AutoReconnectASR(
      () => {
        const client = new FakeASRClient();
        clients.push(client);
        return client;
      },
      { delayMs: 10, maxRetries: 1 },
    );

    await asr.connect();
    clients[0].emit("close");
    asr.disconnect();
    await vi.advanceTimersByTimeAsync(10);

    expect(clients).toHaveLength(1);
  });
});
