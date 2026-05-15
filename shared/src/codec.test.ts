import { describe, expect, it } from "vitest";
import { decodeMessage, encodeMessage } from "./codec";

describe("codec", () => {
  it("encodes to a single-line JSON ending with newline", () => {
    const msg = { v: 1 as const, t: "ping" as const, seq: 1, ts: 100, p: { token: "x" } };
    const buf = encodeMessage(msg);

    expect(buf.toString("utf8").endsWith("\n")).toBe(true);
    expect(buf.toString("utf8").split("\n")).toHaveLength(2);
  });

  it("decodes back to original", () => {
    const msg = { v: 1 as const, t: "ping" as const, seq: 2, ts: 200, p: { token: "y" } };
    const decoded = decodeMessage(encodeMessage(msg).toString("utf8").trim());

    expect(decoded).toEqual(msg);
  });

  it("throws on malformed JSON", () => {
    expect(() => decodeMessage("not json")).toThrow();
  });
});
