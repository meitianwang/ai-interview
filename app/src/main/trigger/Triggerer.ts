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
    const onToken = (token: { text: string }) => {
      collected += token.text;
      this.emit("token", token.text);
    };
    const onDone = () => {
      this.router.off("token", onToken);
      this.router.off("done", onDone);
      this.emit("done", collected);
      this.contextManager.appendHistory(context.transcript, collected);
    };

    this.emit("start", { questionType });
    this.router.on("token", onToken);
    this.router.once("done", onDone);
    await this.router.route(prompt);
  }

  abort(): void {
    this.router.abort();
  }
}
