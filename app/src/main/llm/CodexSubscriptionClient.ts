import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { getCodexAccessToken, type CodexAccessToken } from "./CodexAuth";
import type { LLMClient } from "./LLMClient";
import { readSSE } from "./SSE";

const CODEX_RESPONSES_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_CLIENT_VERSION = "0.128.0";
const MAX_ERROR_BODY_CHARS = 8 * 1024;

type FetchLike = typeof fetch;

export class CodexSubscriptionClient extends EventEmitter implements LLMClient {
  name = "codex-subscription";
  private aborter: AbortController | null = null;

  constructor(
    private readonly config: {
      model: string;
      fetchImpl?: FetchLike;
      getToken?: () => Promise<CodexAccessToken>;
      endpoint?: string;
    },
  ) {
    super();
  }

  async stream(prompt: { system: string; user: string }, options: { timeoutMs: number }): Promise<void> {
    const aborter = new AbortController();
    this.aborter = aborter;
    const timer = setTimeout(() => aborter.abort(), options.timeoutMs);
    const fetchImpl = this.config.fetchImpl ?? fetch;

    try {
      const token = await (this.config.getToken ?? getCodexAccessToken)();
      const requestId = randomUUID();
      const response = await fetchImpl(this.config.endpoint ?? CODEX_RESPONSES_ENDPOINT, {
        method: "POST",
        signal: aborter.signal,
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "ChatGPT-Account-Id": token.accountId,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": "ai-interview-codex-subscription",
          session_id: requestId,
          "x-client-request-id": requestId,
          "x-codex-window-id": requestId,
          version: CODEX_CLIENT_VERSION,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt.user }] }],
          instructions: prompt.system,
          stream: true,
          store: false,
          parallel_tool_calls: false,
        }),
      });

      if (!response.ok || !response.body) {
        const text = limitString(await response.text().catch(() => ""), MAX_ERROR_BODY_CHARS);
        this.emit("error", new Error(`codex ${response.status}${text ? ` - ${text}` : ""}`));
        return;
      }

      let completed = false;
      await readSSE(response.body, (event) => {
        if (event.type === "response.output_text.delta") {
          const delta = typeof event.delta === "string" ? event.delta : event.delta?.text;
          if (delta) {
            this.emit("token", { text: delta });
          }
        }
        if (event.type === "response.failed") {
          throw new Error(event.error?.message ?? event.response?.error?.message ?? "Codex request failed");
        }
        if (event.type === "response.completed") {
          completed = true;
          this.emit("done");
        }
      });
      if (!completed) {
        this.emit("done");
      }
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

function limitString(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(-maxChars) : value;
}
