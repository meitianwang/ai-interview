import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCodexAccessToken, hasCodexCliAuth } from "../../src/main/llm/CodexAuth";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ai-interview-codex-auth-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("CodexAuth", () => {
  it("reads a valid Codex CLI access token without refreshing", async () => {
    const authPath = join(tempDir, "auth.json");
    const accessToken = jwt({ chatgpt_account_id: "acct_1", email: "u@example.com", exp: Math.floor(Date.now() / 1000) + 3600 });
    const fetchImpl = vi.fn();
    await writeFile(
      authPath,
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          access_token: accessToken,
          account_id: "acct_1",
          refresh_token: "refresh",
        },
      }),
      "utf8",
    );

    await expect(getCodexAccessToken({ authPath, fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual({
      accessToken,
      account: "u@example.com",
      accountId: "acct_1",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(hasCodexCliAuth(authPath)).toBe(true);
  });

  it("refreshes expired Codex CLI tokens and writes the rotated refresh token back", async () => {
    const authPath = join(tempDir, "auth.json");
    const expiredAccessToken = jwt({ chatgpt_account_id: "acct_1", exp: Math.floor(Date.now() / 1000) - 60 });
    const nextAccessToken = jwt({ chatgpt_account_id: "acct_2", email: "next@example.com", exp: Math.floor(Date.now() / 1000) + 3600 });
    await writeFile(
      authPath,
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          access_token: expiredAccessToken,
          account_id: "acct_1",
          refresh_token: "old-refresh",
        },
      }),
      "utf8",
    );
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: nextAccessToken,
          refresh_token: "new-refresh",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );

    await expect(getCodexAccessToken({ authPath, fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual({
      accessToken: nextAccessToken,
      account: "next@example.com",
      accountId: "acct_2",
    });
    const saved = JSON.parse(await readFile(authPath, "utf8"));
    expect(saved.tokens.access_token).toBe(nextAccessToken);
    expect(saved.tokens.account_id).toBe("acct_2");
    expect(saved.tokens.refresh_token).toBe("new-refresh");
    expect(saved.last_refresh).toEqual(expect.any(String));
  });

  it("rejects non-ChatGPT Codex auth files", async () => {
    const authPath = join(tempDir, "auth.json");
    await writeFile(authPath, JSON.stringify({ auth_mode: "api-key", tokens: {} }), "utf8");

    await expect(getCodexAccessToken({ authPath })).rejects.toThrow('Unsupported Codex auth mode "api-key"');
  });
});

function jwt(payload: Record<string, unknown>): string {
  return ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");
}
