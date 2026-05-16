import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";
import { readSSE } from "./SSE";

export class OpenAIClient extends EventEmitter implements LLMClient {
  name = "openai";
  private aborter: AbortController | null = null;

  constructor(private readonly config: { apiKey: string; model: string }) {
    super();
  }

  async stream(prompt: { system: string; user: string }, options: { timeoutMs: number }): Promise<void> {
    const aborter = new AbortController();
    this.aborter = aborter;
    const timer = setTimeout(() => aborter.abort(), options.timeoutMs);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: aborter.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: prompt.user,
          instructions: prompt.system,
          max_output_tokens: 800,
          model: this.config.model,
          stream: true,
          store: false,
        }),
      });

      if (!response.ok || !response.body) {
        this.emit("error", new Error(`openai ${response.status}`));
        return;
      }

      await readSSE(response.body, (event) => {
        if (event.type === "response.output_text.delta" && event.delta) {
          this.emit("token", { text: event.delta });
        }
        if (event.type === "response.completed") {
          this.emit("done");
        }
      });
    } catch (error) {
      this.emit("error", error);
    } finally {
      clearTimeout(timer);
    }
  }

  abort(): void {
    this.aborter?.abort();
  }
}
