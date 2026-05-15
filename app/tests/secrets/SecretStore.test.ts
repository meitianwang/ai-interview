import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import keytar from "keytar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretStore } from "../../src/main/secrets/SecretStore";

vi.mock("keytar", () => ({
  default: {
    deletePassword: vi.fn().mockResolvedValue(true),
    getPassword: vi.fn().mockImplementation((_service: string, account: string) => Promise.resolve(`stored-${account}`)),
    setPassword: vi.fn().mockResolvedValue(undefined),
  },
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ai-interview-secret-store-"));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("SecretStore", () => {
  it("stores non-secret fields in JSON and secret fields in Keychain", async () => {
    const store = new SecretStore({ configPath: join(tempDir, "settings.json") });

    await store.saveAll({
      resume: "R",
      jd: "J",
      anthropicKey: "K1",
      openaiKey: "K2",
      huoshanAppId: "A",
      huoshanToken: "T",
    });

    const rawConfig = await readFile(join(tempDir, "settings.json"), "utf8");
    expect(JSON.parse(rawConfig)).toEqual({ resume: "R", jd: "J", huoshanAppId: "A" });
    expect(rawConfig).not.toContain("K1");
    expect(rawConfig).not.toContain("K2");
    expect(rawConfig).not.toContain("T");
    expect(keytar.setPassword).toHaveBeenCalledWith("ai-interview", "anthropicKey", "K1");
    expect(keytar.setPassword).toHaveBeenCalledWith("ai-interview", "openaiKey", "K2");
    expect(keytar.setPassword).toHaveBeenCalledWith("ai-interview", "huoshanToken", "T");

    const loaded = await store.loadAll();
    expect(loaded).toEqual({
      resume: "R",
      jd: "J",
      anthropicKey: "stored-anthropicKey",
      openaiKey: "stored-openaiKey",
      huoshanAppId: "A",
      huoshanToken: "stored-huoshanToken",
    });
  });

  it("deletes keychain entries when secret fields are cleared", async () => {
    const store = new SecretStore({ configPath: join(tempDir, "settings.json") });

    await store.saveAll({ resume: "R" });

    expect(keytar.deletePassword).toHaveBeenCalledWith("ai-interview", "anthropicKey");
    expect(keytar.deletePassword).toHaveBeenCalledWith("ai-interview", "openaiKey");
    expect(keytar.deletePassword).toHaveBeenCalledWith("ai-interview", "huoshanToken");
  });
});
