import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { ClaudeSubscriptionClient } from "../../src/main/llm/ClaudeSubscriptionClient";

describe("ClaudeSubscriptionClient", () => {
  it("passes prompts through stdin and emits stream-json deltas", async () => {
    const child = new FakeClaudeProcess(() => {
      child.stdout.emit(
        "data",
        `${JSON.stringify({
          type: "stream_event",
          event: { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } },
        })}\n`,
      );
      child.emit("close", 0, null);
    });
    const spawnImpl = vi.fn().mockReturnValue(child);
    const client = new ClaudeSubscriptionClient({ model: "sonnet", spawnImpl });
    const tokens: string[] = [];
    client.on("token", (event) => tokens.push(event.text));

    await client.stream({ system: "system prompt", user: "user prompt" }, { timeoutMs: 1000 });
    await child.closed;

    expect(tokens).toEqual(["ok"]);
    expect(child.stdinText).toContain("system prompt");
    expect(child.stdinText).toContain("user prompt");
    expect(spawnImpl.mock.calls[0][0]).toBe("claude");
    expect(spawnImpl.mock.calls[0][1]).toContain("--setting-sources");
    expect(spawnImpl.mock.calls[0][1]).not.toContain("user prompt");
  });

  it("emits bounded stderr when the Claude CLI exits unsuccessfully", async () => {
    const child = new FakeClaudeProcess(() => {
      child.stderr.emit("data", `${"x".repeat(9000)}boom`);
      child.emit("close", 1, null);
    });
    const client = new ClaudeSubscriptionClient({ model: "sonnet", spawnImpl: vi.fn().mockReturnValue(child) });
    const error = new Promise<Error>((resolve) => client.once("error", resolve));

    await client.stream({ system: "", user: "" }, { timeoutMs: 1000 });
    const emitted = await error;

    expect(emitted.message).toContain("boom");
    expect(emitted.message.length).toBeLessThanOrEqual(8 * 1024);
  });
});

class FakeClaudeProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = {
    write: (chunk: string) => {
      this.stdinText += chunk;
    },
    end: () => {
      queueMicrotask(this.onEnd);
    },
  };
  readonly closed: Promise<void>;
  stdinText = "";
  private resolveClosed!: () => void;

  constructor(private readonly onEnd: () => void) {
    super();
    this.closed = new Promise((resolve) => {
      this.resolveClosed = resolve;
    });
    this.once("close", () => this.resolveClosed());
  }

  kill(): boolean {
    this.emit("close", null, "SIGTERM");
    return true;
  }
}
