import type { LLMClient, LLMTokenEvent } from "../llm/LLMClient";
import type { QuestionType } from "../prompt/PromptBuilder";

const SYSTEM_PROMPT =
  "你只做面试问题分类。只能输出 technical、behavioral、general 之一，不要解释，不要输出其他字符。";
const MAX_CLASSIFIER_OUTPUT = 128;

export class LLMQuestionClassifier {
  constructor(
    private readonly client: LLMClient,
    private readonly opts: { timeoutMs: number },
  ) {}

  classify(input: { transcript: string; ocr: string }, fallback: QuestionType): Promise<QuestionType> {
    return new Promise((resolve) => {
      let settled = false;
      let output = "";
      const cleanup = () => {
        clearTimeout(timeout);
        this.client.off("token", onToken);
        this.client.off("done", onDone);
        this.client.off("error", onError);
      };
      const finish = (type: QuestionType) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(type);
      };
      const onToken = (event: LLMTokenEvent) => {
        output = `${output}${event.text}`.slice(0, MAX_CLASSIFIER_OUTPUT);
      };
      const onDone = () => finish(parseQuestionType(output) ?? fallback);
      const onError = () => finish(fallback);
      const timeout = setTimeout(() => {
        this.client.abort();
        finish(fallback);
      }, this.opts.timeoutMs);

      this.client.on("token", onToken);
      this.client.once("done", onDone);
      this.client.once("error", onError);
      this.client.stream(buildPrompt(input), { timeoutMs: this.opts.timeoutMs }).catch(onError);
    });
  }
}

function buildPrompt(input: { transcript: string; ocr: string }) {
  return {
    system: SYSTEM_PROMPT,
    user: `面试官最近说：\n${input.transcript || "（无）"}\n\n屏幕题面：\n${input.ocr || "（无）"}\n\n分类：`,
  };
}

function parseQuestionType(output: string): QuestionType | null {
  const normalized = output.trim().toLowerCase();
  if (normalized.includes("technical")) {
    return "technical";
  }
  if (normalized.includes("behavioral")) {
    return "behavioral";
  }
  if (normalized.includes("general")) {
    return "general";
  }

  return null;
}
