import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { LLMClient } from "../../src/main/llm/LLMClient";
import { LLMRouter } from "../../src/main/llm/LLMRouter";

class FakeClient extends EventEmitter implements LLMClient {
  streamCalls = 0;

  constructor(
    public name: string,
    private readonly behavior: "ok" | "fail" | "timeout",
  ) {
    super();
  }

  async stream(): Promise<void> {
    this.streamCalls += 1;
    if (this.behavior === "fail") {
      throw new Error("boom");
    }
    if (this.behavior === "timeout") {
      return new Promise(() => {});
    }

    setTimeout(() => this.emit("token", { text: "x" }), 10);
    setTimeout(() => this.emit("done"), 20);
  }

  abort(): void {
    this.emit("aborted");
  }
}

describe("LLMRouter", () => {
  it("uses primary when ok", async () => {
    const primary = new FakeClient("primary", "ok");
    const fallback = new FakeClient("fallback", "ok");
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 100 });
    const tokens: string[] = [];
    router.on("token", (token) => tokens.push(token.text));

    await router.route({ system: "s", user: "u" });

    expect(tokens.length).toBeGreaterThan(0);
  });

  it("falls back on primary error", async () => {
    const primary = new FakeClient("primary", "fail");
    const fallback = new FakeClient("fallback", "ok");
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 100 });
    const events: string[] = [];
    router.on("token", () => events.push("token"));
    router.on("fallback", () => events.push("fallback"));

    await router.route({ system: "s", user: "u" });

    expect(events).toContain("fallback");
    expect(events).toContain("token");
  });

  it("falls back when primary times out", async () => {
    const primary = new FakeClient("primary", "timeout");
    const fallback = new FakeClient("fallback", "ok");
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 20 });
    const events: string[] = [];
    router.on("fallback", () => events.push("fallback"));
    router.on("token", () => events.push("token"));

    await router.route({ system: "s", user: "u" });

    expect(events).toEqual(["fallback", "token"]);
  });

  it("aborts an active route without falling back", async () => {
    const primary = new FakeClient("primary", "timeout");
    const fallback = new FakeClient("fallback", "ok");
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 1000 });
    const events: string[] = [];
    router.on("fallback", () => events.push("fallback"));
    router.on("done", () => events.push("done"));

    const route = router.route({ system: "s", user: "u" });
    router.abort();
    await route;

    expect(events).toEqual([]);
  });

  it("uses updated clients for later routes", async () => {
    const oldPrimary = new FakeClient("old-primary", "ok");
    const newPrimary = new FakeClient("new-primary", "ok");
    const fallback = new FakeClient("fallback", "ok");
    const router = new LLMRouter({ primary: oldPrimary, fallback }, { timeoutMs: 100 });

    router.updateClients({ primary: newPrimary, fallback });
    await router.route({ system: "s", user: "u" });

    expect(oldPrimary.streamCalls).toBe(0);
    expect(newPrimary.streamCalls).toBe(1);
  });
});
