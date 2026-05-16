import { describe, expect, it, vi } from "vitest";
import { ClaudeSubscriptionClient } from "../../src/main/llm/ClaudeSubscriptionClient";

describe("ClaudeSubscriptionClient", () => {
  it("streams official Messages API deltas with Claude OAuth headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encodeSSE({ type: "content_block_delta", delta: { type: "text_delta", text: "ok" } }));
            controller.enqueue(encodeSSE({ type: "message_stop" }));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    const client = new ClaudeSubscriptionClient({
      endpoint: "https://example.test/v1/messages",
      fetchImpl: fetchImpl as typeof fetch,
      getToken: async () => ({ accessToken: "token", source: "test" }),
      model: "claude-test",
    });
    const tokens: string[] = [];
    client.on("token", (event) => tokens.push(event.text));

    await client.stream({ system: "system prompt", user: "user prompt" }, { timeoutMs: 1000 });

    expect(tokens).toEqual(["ok"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "anthropic-beta": "oauth-2025-04-20",
          "anthropic-version": "2023-06-01",
          "x-app": "cli",
        }),
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      max_tokens: 800,
      model: "claude-test",
      stream: true,
      system: "system prompt",
      messages: [{ role: "user", content: "user prompt" }],
    });
  });

  it("emits official Messages API errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }));
    const client = new ClaudeSubscriptionClient({
      fetchImpl: fetchImpl as typeof fetch,
      getToken: async () => ({ accessToken: "token", source: "test" }),
      model: "claude-test",
    });
    const error = new Promise<Error>((resolve) => client.once("error", resolve));

    await client.stream({ system: "", user: "" }, { timeoutMs: 1000 });
    const emitted = await error;

    expect(emitted.message).toContain("claude subscription 429");
    expect(emitted.message).toContain("rate limited");
  });
});

function encodeSSE(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}
