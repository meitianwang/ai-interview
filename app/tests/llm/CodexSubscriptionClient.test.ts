import { describe, expect, it, vi } from "vitest";
import { CodexSubscriptionClient } from "../../src/main/llm/CodexSubscriptionClient";

describe("CodexSubscriptionClient", () => {
  it("streams Codex Responses text deltas", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encodeSSE({ type: "response.output_text.delta", delta: "你" }));
            controller.enqueue(encodeSSE({ type: "response.output_text.delta", delta: { text: "好" } }));
            controller.enqueue(encodeSSE({ type: "response.completed" }));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    const client = new CodexSubscriptionClient({
      endpoint: "https://example.test/responses",
      fetchImpl: fetchImpl as typeof fetch,
      getToken: async () => ({ accessToken: "token", accountId: "acct" }),
      model: "gpt-test",
    });
    const tokens: string[] = [];
    client.on("token", (event) => tokens.push(event.text));

    await client.stream({ system: "system", user: "user" }, { timeoutMs: 1000 });

    expect(tokens.join("")).toBe("你好");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "ChatGPT-Account-Id": "acct",
        }),
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      instructions: "system",
      model: "gpt-test",
      stream: true,
      store: false,
    });
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(body.input[0].content[0].text).toBe("user");
  });

  it("emits provider failures from Codex SSE events", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encodeSSE({ type: "response.failed", error: { message: "bad token" } }));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    const client = new CodexSubscriptionClient({
      fetchImpl: fetchImpl as typeof fetch,
      getToken: async () => ({ accessToken: "token", accountId: "acct" }),
      model: "gpt-test",
    });
    const error = new Promise<unknown>((resolve) => client.once("error", resolve));

    await client.stream({ system: "", user: "" }, { timeoutMs: 1000 });

    await expect(error).resolves.toMatchObject({ message: "bad token" });
  });
});

function encodeSSE(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}
