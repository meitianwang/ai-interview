import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";
import { readSSE } from "./SSE";

export class ClaudeClient extends EventEmitter implements LLMClient {
  name = "claude";
  private aborter: AbortController | null = null;

  constructor(private readonly config: { apiKey: string; model: string }) {
    super();
  }

  async stream(prompt: { system: string; user: string }, options: { timeoutMs: number }): Promise<void> {
    const aborter = new AbortController();
    this.aborter = aborter;
    const timer = setTimeout(() => aborter.abort(), options.timeoutMs);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: aborter.signal,
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          max_tokens: 800,
          messages: [{ role: "user", content: prompt.user }],
          model: this.config.model,
          stream: true,
          system: prompt.system,
        }),
      });

      if (!response.ok || !response.body) {
        this.emit("error", new Error(`claude ${response.status}`));
        return;
      }

      await readSSE(response.body, (event) => {
        if (event.type === "content_block_delta" && event.delta?.text) {
          this.emit("token", { text: event.delta.text });
        }
        if (event.type === "message_stop") {
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
