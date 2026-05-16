import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { LLMQuestionClassifier } from "../../src/main/classifier/LLMQuestionClassifier";
import type { LLMClient } from "../../src/main/llm/LLMClient";

class FakeLLM extends EventEmitter implements LLMClient {
  name = "fake-classifier";
  aborted = false;

  constructor(private readonly output: string | Error) {
    super();
  }

  async stream(): Promise<void> {
    if (this.output instanceof Error) {
      this.emit("error", this.output);
      return;
    }

    this.emit("token", { text: this.output });
    this.emit("done");
  }

  abort(): void {
    this.aborted = true;
  }
}

describe("LLMQuestionClassifier", () => {
  it("uses the exact label emitted by the LLM client", async () => {
    const classifier = new LLMQuestionClassifier(new FakeLLM("behavioral"), { timeoutMs: 100 });

    await expect(classifier.classify({ ocr: "", transcript: "聊聊你的一次冲突" }, "general")).resolves.toBe(
      "behavioral",
    );
  });

  it("falls back when the LLM output is not parseable", async () => {
    const classifier = new LLMQuestionClassifier(new FakeLLM("我不确定"), { timeoutMs: 100 });

    await expect(classifier.classify({ ocr: "", transcript: "看下这题" }, "general")).resolves.toBe("general");
  });

  it("falls back on client errors", async () => {
    const classifier = new LLMQuestionClassifier(new FakeLLM(new Error("boom")), { timeoutMs: 100 });

    await expect(classifier.classify({ ocr: "", transcript: "看下这题" }, "technical")).resolves.toBe("technical");
  });
});
