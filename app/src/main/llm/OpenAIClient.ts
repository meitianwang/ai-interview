import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";

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

async function readSSE(body: ReadableStream<Uint8Array>, onEvent: (event: any) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (dataLine) {
        try {
          onEvent(JSON.parse(dataLine.slice(6)));
        } catch {
          // Ignore provider heartbeat or malformed event payloads.
        }
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }
}
