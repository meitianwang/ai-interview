import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";
import { ContextManager } from "../../src/main/context/ContextManager";

describe("ContextManager", () => {
  it("builds context with resume, jd, transcript, and ocr", () => {
    const transcriptStore = new TranscriptStore();
    transcriptStore.applyFinal("你介绍一下自己。", Date.now());
    const contextManager = new ContextManager({
      resume: "5 年 Android 开发，主导过 xxx",
      jd: "字节 Android 高级",
      ocr: "屏幕题面",
      transcriptStore,
    });

    const context = contextManager.buildContext({ transcriptTailSeconds: 30 });

    expect(context.resume).toContain("Android");
    expect(context.jd).toContain("字节");
    expect(context.ocr).toContain("屏幕题面");
    expect(context.transcript).toContain("介绍一下");
  });

  it("keeps only the latest 10 history entries", () => {
    const contextManager = new ContextManager({ transcriptStore: new TranscriptStore() });
    for (let i = 0; i < 12; i += 1) {
      contextManager.appendHistory(`q${i}`, `a${i}`);
    }

    const context = contextManager.buildContext();

    expect(context.history).toHaveLength(10);
    expect(context.history[0]).toEqual({ q: "q2", a: "a2" });
  });
});
