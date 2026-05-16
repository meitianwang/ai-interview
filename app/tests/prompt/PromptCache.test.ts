import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";
import { ContextManager } from "../../src/main/context/ContextManager";
import { PromptBuilder } from "../../src/main/prompt/PromptBuilder";
import { PromptCache } from "../../src/main/prompt/PromptCache";

describe("PromptCache", () => {
  it("prebuilds all question-type prompts from one context snapshot", () => {
    const transcriptStore = new TranscriptStore();
    transcriptStore.applyFinal("请实现一个反转链表。", 100);
    const contextManager = new ContextManager({
      jd: "后端工程师",
      resume: "做过 TypeScript 服务端",
      transcriptStore,
    });
    const cache = new PromptCache(contextManager, new PromptBuilder(), () => 123);

    const snapshot = cache.refresh();

    expect(snapshot.builtAt).toBe(123);
    expect(snapshot.context.transcript).toContain("反转链表");
    expect(snapshot.prompts.general.user).toBe(snapshot.prompts.technical.user);
    expect(snapshot.prompts.technical.system).toContain("技术题");
    expect(snapshot.prompts.behavioral.system).toContain("行为面试题");
  });

  it("returns lazy prepared prompts and can be cleared", () => {
    const transcriptStore = new TranscriptStore();
    transcriptStore.applyFinal("你介绍一下自己吧？", 100);
    const contextManager = new ContextManager({ transcriptStore });
    let now = 10;
    const cache = new PromptCache(contextManager, new PromptBuilder(), () => now);

    const first = cache.get("general");
    transcriptStore.applyFinal("再讲一个冲突案例。", 200);
    now = 20;
    const stillCached = cache.get("general");
    cache.clear();
    const refreshed = cache.get("behavioral");

    expect(first.builtAt).toBe(10);
    expect(stillCached.context.transcript).not.toContain("冲突案例");
    expect(refreshed.builtAt).toBe(20);
    expect(refreshed.context.transcript).toContain("冲突案例");
  });
});
