import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";
import { QuestionClassifier } from "../../src/main/classifier/QuestionClassifier";
import { ContextManager } from "../../src/main/context/ContextManager";
import type { LLMClient } from "../../src/main/llm/LLMClient";
import { LLMRouter } from "../../src/main/llm/LLMRouter";
import { PromptBuilder } from "../../src/main/prompt/PromptBuilder";
import { Triggerer } from "../../src/main/trigger/Triggerer";

class FakeLLM extends EventEmitter implements LLMClient {
  name = "fake";

  async stream(): Promise<void> {
    setTimeout(() => this.emit("token", { text: "**简介**：" }), 10);
    setTimeout(() => this.emit("token", { text: "5 年 Android，重点做稳定性和性能。" }), 30);
    setTimeout(() => this.emit("done"), 50);
  }

  abort(): void {
    this.emit("aborted");
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("full mock session", () => {
  it("classifies a behavioral question and produces an answer", async () => {
    const transcriptStore = new TranscriptStore();
    transcriptStore.applyFinal("你介绍一下自己吧？", Date.now());
    const contextManager = new ContextManager({
      jd: "字节 Android 客户端",
      resume: "5 年 Android 开发，做过性能优化和架构治理",
      transcriptStore,
    });
    const classifier = new QuestionClassifier();
    const context = contextManager.buildContext();
    const questionType = classifier.classify({ ocr: context.ocr, transcript: context.transcript });
    const router = new LLMRouter(
      {
        fallback: new FakeLLM(),
        primary: new FakeLLM(),
      },
      { timeoutMs: 500 },
    );
    const triggerer = new Triggerer(contextManager, new PromptBuilder(), router);
    const tokens: string[] = [];
    triggerer.on("token", (token) => tokens.push(token));

    const answer = triggerer.fire(questionType);
    await vi.advanceTimersByTimeAsync(100);
    await answer;

    expect(questionType).toBe("behavioral");
    expect(tokens.join("")).toContain("Android");
    expect(contextManager.buildContext().history).toHaveLength(1);
  });
});
