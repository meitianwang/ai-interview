import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";
import { ContextManager } from "../../src/main/context/ContextManager";
import type { LLMClient } from "../../src/main/llm/LLMClient";
import { LLMRouter } from "../../src/main/llm/LLMRouter";
import { MockLLMClient } from "../../src/main/llm/MockLLMClient";
import type { Prompt } from "../../src/main/prompt/PromptBuilder";
import { PromptBuilder } from "../../src/main/prompt/PromptBuilder";
import { Triggerer } from "../../src/main/trigger/Triggerer";

class CapturingLLM extends EventEmitter implements LLMClient {
  name = "capturing";
  prompts: Prompt[] = [];

  async stream(prompt: Prompt): Promise<void> {
    this.prompts.push(prompt);
    this.emit("token", { text: "缓存答案" });
    this.emit("done");
  }

  abort(): void {
    this.emit("aborted");
  }
}

describe("Triggerer", () => {
  it("streams tokens and appends answer history", async () => {
    const transcriptStore = new TranscriptStore();
    transcriptStore.applyFinal("你介绍一下自己。", 100);
    const contextManager = new ContextManager({ transcriptStore });
    const router = new LLMRouter(
      {
        primary: new MockLLMClient("答案"),
        fallback: new MockLLMClient("备用"),
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

  it("uses a prepared prompt snapshot when provided", async () => {
    const transcriptStore = new TranscriptStore();
    transcriptStore.applyFinal("旧问题", 100);
    const contextManager = new ContextManager({ transcriptStore });
    const primary = new CapturingLLM();
    const router = new LLMRouter(
      {
        primary,
        fallback: new MockLLMClient("备用"),
      },
      { timeoutMs: 200 },
    );
    const triggerer = new Triggerer(contextManager, new PromptBuilder(), router);

    await triggerer.fire("technical", {
      builtAt: 123,
      context: {
        history: [],
        jd: "",
        ocr: "",
        resume: "",
        transcript: "缓存问题",
      },
      prompt: {
        system: "cached system",
        user: "cached user",
      },
    });

    expect(primary.prompts[0]).toEqual({ system: "cached system", user: "cached user" });
    expect(contextManager.buildContext().history[0]).toEqual({ q: "缓存问题", a: "缓存答案" });
  });
});
