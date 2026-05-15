import { EventEmitter } from "node:events";
import type { ContextManager } from "../context/ContextManager";
import type { LLMRouter } from "../llm/LLMRouter";
import type { PromptBuilder, QuestionType } from "../prompt/PromptBuilder";

export class Triggerer extends EventEmitter {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly promptBuilder: PromptBuilder,
    private readonly router: LLMRouter,
  ) {
    super();
  }

  async fire(questionType: QuestionType = "general"): Promise<void> {
    const context = this.contextManager.buildContext({ transcriptTailSeconds: 30 });
    const prompt = this.promptBuilder.build({ questionType, context });
    let collected = "";
    let completed = false;
    const cleanup = () => {
      this.router.off("token", onToken);
      this.router.off("done", onDone);
    };
    const onToken = (token: { text: string }) => {
      collected += token.text;
      this.emit("token", token.text);
    };
    const onDone = () => {
      completed = true;
      cleanup();
      this.emit("done", collected);
      this.contextManager.appendHistory(context.transcript, collected);
    };

    this.emit("start", { questionType });
    this.router.on("token", onToken);
    this.router.once("done", onDone);
    try {
      await this.router.route(prompt);
    } finally {
      if (!completed) {
        cleanup();
      }
    }
  }

  abort(): void {
    this.router.abort();
  }
}
