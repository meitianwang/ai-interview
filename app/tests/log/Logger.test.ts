import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Logger } from "../../src/main/log/Logger";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ai-interview-logger-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("Logger", () => {
  it("redacts sensitive metadata fields", async () => {
    const file = join(tempDir, "app.jsonl");
    const logger = new Logger(file);

    logger.log({
      level: "info",
      module: "test",
      type: "event",
      meta: {
        answer: "secret answer",
        nested: { ocrText: "screen text", safe: "ok" },
        prompt: "secret prompt",
        safe: "visible",
        token: "api-token",
      },
    });
    await logger.close();

    const raw = await readFile(file, "utf8");
    const entry = JSON.parse(raw);
    expect(entry.meta).toEqual({ nested: { safe: "ok" }, safe: "visible" });
    expect(raw).not.toContain("secret answer");
    expect(raw).not.toContain("screen text");
    expect(raw).not.toContain("api-token");
  });

  it("bounds long metadata strings", async () => {
    const file = join(tempDir, "app.jsonl");
    const logger = new Logger(file);

    logger.log({
      level: "warn",
      module: "test",
      type: "long",
      meta: { safe: "x".repeat(2000) },
    });
    await logger.close();

    const raw = await readFile(file, "utf8");
    const entry = JSON.parse(raw);
    expect(entry.meta.safe.length).toBeLessThan(600);
  });
});
