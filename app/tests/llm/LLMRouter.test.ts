import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { LLMRouter } from "../../src/main/llm/LLMRouter";

class FakeClient extends EventEmitter {
  constructor(
    public name: string,
    private readonly behavior: "ok" | "fail" | "timeout",
  ) {
    super();
  }

  async stream(): Promise<void> {
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
    const primary = new FakeClient("primary", "ok") as any;
    const fallback = new FakeClient("fallback", "ok") as any;
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 100 });
    const tokens: string[] = [];
    router.on("token", (token) => tokens.push(token.text));

    await router.route({ system: "s", user: "u" });

    expect(tokens.length).toBeGreaterThan(0);
  });

  it("falls back on primary error", async () => {
    const primary = new FakeClient("primary", "fail") as any;
    const fallback = new FakeClient("fallback", "ok") as any;
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 100 });
    const events: string[] = [];
    router.on("token", () => events.push("token"));
    router.on("fallback", () => events.push("fallback"));

    await router.route({ system: "s", user: "u" });

    expect(events).toContain("fallback");
    expect(events).toContain("token");
  });

  it("falls back when primary times out", async () => {
    const primary = new FakeClient("primary", "timeout") as any;
    const fallback = new FakeClient("fallback", "ok") as any;
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 20 });
    const events: string[] = [];
    router.on("fallback", () => events.push("fallback"));
    router.on("token", () => events.push("token"));

    await router.route({ system: "s", user: "u" });

    expect(events).toEqual(["fallback", "token"]);
  });

  it("aborts an active route without falling back", async () => {
    const primary = new FakeClient("primary", "timeout") as any;
    const fallback = new FakeClient("fallback", "ok") as any;
    const router = new LLMRouter({ primary, fallback }, { timeoutMs: 1000 });
    const events: string[] = [];
    router.on("fallback", () => events.push("fallback"));
    router.on("done", () => events.push("done"));

    const route = router.route({ system: "s", user: "u" });
    router.abort();
    await route;

    expect(events).toEqual([]);
  });
});
