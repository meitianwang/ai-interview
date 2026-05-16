import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClaudeAccessToken, hasClaudeOAuthCredentials, type ClaudeCredentialSource } from "../../src/main/llm/ClaudeOAuth";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ai-interview-claude-oauth-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("ClaudeOAuth", () => {
  it("reads a valid Claude Code OAuth token from credentials storage", async () => {
    const source = await writeCredentials({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600_000,
      scopes: ["user:inference"],
    });

    await expect(getClaudeAccessToken({ sources: [source] })).resolves.toEqual({
      accessToken: "access",
      source: source.source,
    });
    expect(hasClaudeOAuthCredentials([source])).toBe(true);
  });

  it("refreshes expired Claude Code OAuth tokens and writes them back", async () => {
    const source = await writeCredentials({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 1,
      scopes: ["user:inference"],
      subscriptionType: "max",
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
          scope: "user:profile user:inference",
        }),
        { status: 200 },
      ),
    );

    await expect(getClaudeAccessToken({ fetchImpl: fetchImpl as typeof fetch, sources: [source] })).resolves.toEqual({
      accessToken: "new-access",
      source: source.source,
    });
    const saved = JSON.parse(await readFile(source.path, "utf8"));
    expect(saved.claudeAiOauth).toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      scopes: ["user:profile", "user:inference"],
      subscriptionType: "max",
    });
  });
});

async function writeCredentials(oauth: Record<string, unknown>): Promise<ClaudeCredentialSource & { kind: "file"; path: string }> {
  const path = join(tempDir, ".credentials.json");
  await writeFile(path, JSON.stringify({ claudeAiOauth: oauth }), "utf8");
  return { kind: "file", path, source: path };
}
