import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";
import { ContextManager } from "../../src/main/context/ContextManager";
import { LLMRouter } from "../../src/main/llm/LLMRouter";
import { MockLLMClient } from "../../src/main/llm/MockLLMClient";
import { PromptBuilder } from "../../src/main/prompt/PromptBuilder";
import { Triggerer } from "../../src/main/trigger/Triggerer";

describe("Triggerer", () => {
  it("streams tokens and appends answer history", async () => {
    const transcriptStore = new TranscriptStore();
    transcriptStore.applyFinal("你介绍一下自己。", 100);
    const contextManager = new ContextManager({ transcriptStore });
    const router = new LLMRouter(
      {
        primary: new MockLLMClient("答案") as any,
        fallback: new MockLLMClient("备用") as any,
      },
      { timeoutMs: 200 },
    );
    const triggerer = new Triggerer(contextManager, new PromptBuilder(), router);
    const events: string[] = [];
    triggerer.on("start", () => events.push("start"));
    triggerer.on("token", (token) => events.push(token));

    await triggerer.fire("general");

    expect(events).toContain("start");
    expect(events.join("")).toContain("答案");
    expect(contextManager.buildContext().history[0].a).toContain("答案");
  });
});
