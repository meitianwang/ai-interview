import type { Context } from "../context/ContextManager";
import { buildUserPrompt, SYSTEM_BEHAVIORAL, SYSTEM_GENERAL, SYSTEM_TECHNICAL } from "./templates";

export type QuestionType = "technical" | "behavioral" | "general";

export interface Prompt {
  system: string;
  user: string;
}

export class PromptBuilder {
  build(input: { questionType: QuestionType; context: Context }): Prompt {
    const system =
      input.questionType === "technical"
        ? SYSTEM_TECHNICAL
        : input.questionType === "behavioral"
          ? SYSTEM_BEHAVIORAL
          : SYSTEM_GENERAL;

    return {
      system,
      user: buildUserPrompt(input.context),
    };
  }
}
