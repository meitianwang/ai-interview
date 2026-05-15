import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";
import { QuestionClassifier } from "../../src/main/classifier/QuestionClassifier";
import { ContextManager } from "../../src/main/context/ContextManager";
import { loadSession, playInto } from "./IpcReplay";

const currentDir = dirname(fileURLToPath(import.meta.url));
const sampleSessionPath = join(currentDir, "sample-session.jsonl");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("replay session", () => {
  it("loads jsonl events as sidecar lines", async () => {
    const events = await loadSession(sampleSessionPath);

    expect(events).toHaveLength(3);
    expect(JSON.parse(events[2].line)).toMatchObject({ t: "ocr.result" });
  });

  it("classifier picks technical when OCR shows code-style question", async () => {
    const events = await loadSession(sampleSessionPath);
    const transcriptStore = new TranscriptStore();
    const contextManager = new ContextManager({ transcriptStore });
    const play = playInto(events, (line) => {
      const message = JSON.parse(line);
      if (message.t === "ocr.result") {
        contextManager.updateOCR(message.p.text);
      }
    });

    await vi.runAllTimersAsync();
    await play;

    const classifier = new QuestionClassifier();
    const context = contextManager.buildContext();
    expect(classifier.classify({ transcript: context.transcript, ocr: context.ocr })).toBe("technical");
  });
});
