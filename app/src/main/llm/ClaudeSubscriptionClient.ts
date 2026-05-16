import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { getClaudeAccessToken, getClaudeOAuthBetaHeader, type ClaudeAccessToken } from "./ClaudeOAuth";
import type { LLMClient } from "./LLMClient";
import { readSSE } from "./SSE";

const CLAUDE_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MAX_ERROR_BODY_CHARS = 8 * 1024;

type FetchLike = typeof fetch;

export class ClaudeSubscriptionClient extends EventEmitter implements LLMClient {
  name = "claude-subscription";
  private aborter: AbortController | null = null;

  constructor(
    private readonly config: {
      endpoint?: string;
      fetchImpl?: FetchLike;
      getToken?: (opts?: { forceRefresh?: boolean }) => Promise<ClaudeAccessToken>;
      model: string;
    },
  ) {
    super();
  }

  async stream(prompt: { system: string; user: string }, options: { timeoutMs: number }): Promise<void> {
    const aborter = new AbortController();
    this.aborter = aborter;
    const timer = setTimeout(() => aborter.abort(), options.timeoutMs);

    try {
      const response = await this.request(prompt, aborter.signal);
      if (response.status === 401 && !this.config.getToken) {
        const retry = await this.request(prompt, aborter.signal, true);
        await this.consumeResponse(retry);
        return;
      }

      await this.consumeResponse(response);
    } catch (error) {
      this.emit("error", error);
    } finally {
      clearTimeout(timer);
    }
  }

  abort(): void {
    this.aborter?.abort();
  }

  private async request(prompt: { system: string; user: string }, signal: AbortSignal, forceRefresh = false): Promise<Response> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const token = await (this.config.getToken ?? getClaudeAccessToken)({ forceRefresh });
    return await fetchImpl(this.config.endpoint ?? CLAUDE_MESSAGES_ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": getClaudeOAuthBetaHeader(),
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-app": "cli",
        "User-Agent": "claude-cli/2.1.143 (external, ai-interview)",
        "X-Claude-Code-Session-Id": randomUUID(),
        "x-client-request-id": randomUUID(),
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 800,
        stream: true,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
  }

  private async consumeResponse(response: Response): Promise<void> {
    if (!response.ok || !response.body) {
      const text = limitString(await response.text().catch(() => ""), MAX_ERROR_BODY_CHARS);
      this.emit("error", new Error(`claude subscription ${response.status}${text ? ` - ${text}` : ""}`));
      return;
    }

    let completed = false;
    await readSSE(response.body, (event) => {
      if (event.type === "content_block_delta" && event.delta?.text) {
        this.emit("token", { text: event.delta.text });
      }
      if (event.type === "error") {
        throw new Error(event.error?.message ?? "Claude subscription stream error");
      }
      if (event.type === "message_stop") {
        completed = true;
        this.emit("done");
      }
    });
    if (!completed) {
      this.emit("done");
    }
  }
}

function limitString(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(-maxChars) : value;
}
