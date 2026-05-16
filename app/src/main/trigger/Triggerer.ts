import { EventEmitter } from "node:events";
import type { ContextManager } from "../context/ContextManager";
import type { LLMRouter } from "../llm/LLMRouter";
import type { PreparedPrompt, PromptBuilder, QuestionType } from "../prompt/PromptBuilder";

export class Triggerer extends EventEmitter {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly promptBuilder: PromptBuilder,
    private readonly router: LLMRouter,
  ) {
    super();
  }

  async fire(questionType: QuestionType = "general", preparedPrompt?: PreparedPrompt): Promise<void> {
    const context = preparedPrompt?.context ?? this.contextManager.buildContext({ transcriptTailSeconds: 30 });
    const prompt = preparedPrompt?.prompt ?? this.promptBuilder.build({ questionType, context });
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
      if (collected.length > 0) {
        this.contextManager.appendHistory(context.transcript, collected);
      }
    };

    this.emit("start", { promptBuiltAt: preparedPrompt?.builtAt, promptPrebuilt: Boolean(preparedPrompt), questionType });
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
