import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";

describe("TranscriptStore", () => {
  it("partial overwrites the live segment, final commits", () => {
    const store = new TranscriptStore();

    store.applyPartial("你", 100);
    store.applyPartial("你好", 200);
    expect(store.snapshot()).toBe("你好");

    store.applyFinal("你好。", 300);
    expect(store.snapshot()).toBe("你好。");
    expect(store.committedSegments()).toEqual([{ text: "你好。", ts: 300 }]);
  });

  it("trims old commits beyond window", () => {
    const store = new TranscriptStore({ windowMs: 1000 });

    store.applyFinal("a", 0);
    store.applyFinal("b", 1500);

    expect(store.committedSegments().map((segment) => segment.text)).toEqual(["b"]);
  });

  it("tail returns last N chars of full transcript", () => {
    const store = new TranscriptStore();

    store.applyFinal("你好世界", 0);

    expect(store.tail(2)).toBe("世界");
  });
});
