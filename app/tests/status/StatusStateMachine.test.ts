import { describe, expect, it } from "vitest";
import { StatusStateMachine } from "../../src/main/status/StatusStateMachine";

describe("StatusStateMachine", () => {
  it("starts green", () => {
    expect(new StatusStateMachine().level()).toBe("green");
  });

  it("downgrades to yellow on fallback", () => {
    const status = new StatusStateMachine();

    status.report("llm.fallback");

    expect(status.level()).toBe("yellow");
  });

  it("uses the highest active severity", () => {
    const status = new StatusStateMachine();

    status.report("llm.fallback");
    status.report("asr.failed");
    status.report("ipc.disconnected");

    expect(status.level()).toBe("red");
  });

  it("returns to lower severity when critical events clear", () => {
    const status = new StatusStateMachine();

    status.report("llm.fallback");
    status.report("ipc.disconnected");
    status.clear("ipc.disconnected");

    expect(status.level()).toBe("yellow");
  });
});
