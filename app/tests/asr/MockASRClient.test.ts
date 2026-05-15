import { describe, expect, it } from "vitest";
import { MockASRClient } from "../../src/main/asr/MockASRClient";

describe("MockASRClient", () => {
  it("emits partial then final for a scripted input", async () => {
    const client = new MockASRClient({
      script: [
        { afterMs: 10, type: "partial", text: "你" },
        { afterMs: 20, type: "partial", text: "你好" },
        { afterMs: 30, type: "final", text: "你好。" },
      ],
    });
    const events: any[] = [];
    client.on("transcript", (event) => events.push(event));

    await client.connect();
    client.pushAudio(Buffer.alloc(100));
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(events.map((event) => event.type)).toEqual(["partial", "partial", "final"]);
    expect(events[2].text).toBe("你好。");
  });

  it("only starts the scripted playback once until disconnected", async () => {
    const client = new MockASRClient({
      script: [{ afterMs: 10, type: "final", text: "一次" }],
    });
    const events: any[] = [];
    client.on("transcript", (event) => events.push(event));

    client.pushAudio(Buffer.alloc(1));
    client.pushAudio(Buffer.alloc(1));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(events).toHaveLength(1);
  });
});
