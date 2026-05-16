import type { Context, ContextManager } from "../context/ContextManager";
import type { PreparedPrompt, Prompt, PromptBuilder, QuestionType } from "./PromptBuilder";

export interface PromptCacheSnapshot {
  context: Context;
  prompts: Record<QuestionType, Prompt>;
  builtAt: number;
}

const QUESTION_TYPES: QuestionType[] = ["general", "behavioral", "technical"];

export class PromptCache {
  private current: PromptCacheSnapshot | null = null;

  constructor(
    private readonly contextManager: ContextManager,
    private readonly promptBuilder: PromptBuilder,
    private readonly now: () => number = Date.now,
  ) {}

  refresh(): PromptCacheSnapshot {
    const context = this.contextManager.buildContext({ transcriptTailSeconds: 30 });
    const prompts = Object.fromEntries(
      QUESTION_TYPES.map((questionType) => [questionType, this.promptBuilder.build({ questionType, context })]),
    ) as Record<QuestionType, Prompt>;

    this.current = {
      builtAt: this.now(),
      context,
      prompts,
    };
    return this.current;
  }

  snapshot(): PromptCacheSnapshot {
    return this.current ?? this.refresh();
  }

  get(questionType: QuestionType): PreparedPrompt {
    return this.pick(this.snapshot(), questionType);
  }

  pick(snapshot: PromptCacheSnapshot, questionType: QuestionType): PreparedPrompt {
    return {
      builtAt: snapshot.builtAt,
      context: snapshot.context,
      prompt: snapshot.prompts[questionType],
    };
  }

  clear(): void {
    this.current = null;
  }
}
