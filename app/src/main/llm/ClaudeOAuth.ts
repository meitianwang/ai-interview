import { execFile, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_CREDENTIAL_CHARS = 64 * 1024;
const MAX_ERROR_BODY_CHARS = 8 * 1024;
const KEYCHAIN_STDIN_LINE_LIMIT = 4096 - 64;
const CLAUDE_AI_OAUTH_SCOPES = [
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
];

type FetchLike = typeof fetch;

export interface ClaudeAccessToken {
  accessToken: string;
  source: string;
}

export interface ClaudeOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  subscriptionType?: string | null;
  rateLimitTier?: string | null;
  [key: string]: unknown;
}

interface SecureStorageData {
  claudeAiOauth?: ClaudeOAuthTokens;
  [key: string]: unknown;
}

export type ClaudeCredentialSource =
  | { kind: "file"; path: string; source: string }
  | { kind: "keychain"; service: string; source: string };

let memoryToken: { accessToken: string; expiresAt?: number; source: string } | null = null;

export function hasClaudeOAuthCredentials(sources = defaultCredentialSources()): boolean {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return true;
  }

  return sources.some((source) => {
    if (source.kind === "file") {
      return existsSync(source.path);
    }
    return hasKeychainEntry(source.service);
  });
}

export async function getClaudeAccessToken(
  opts: { fetchImpl?: FetchLike; forceRefresh?: boolean; sources?: ClaudeCredentialSource[] } = {},
): Promise<ClaudeAccessToken> {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN && !opts.forceRefresh) {
    return { accessToken: process.env.CLAUDE_CODE_OAUTH_TOKEN, source: "CLAUDE_CODE_OAUTH_TOKEN" };
  }

  const sources = opts.sources ?? defaultCredentialSources();
  if (!opts.forceRefresh && memoryToken && !isExpired(memoryToken.expiresAt) && sources.some((source) => source.source === memoryToken?.source)) {
    return { accessToken: memoryToken.accessToken, source: memoryToken.source };
  }

  for (const source of sources) {
    const stored = await readCredentialSource(source);
    const oauth = stored.data?.claudeAiOauth;
    if (!oauth?.accessToken || !hasInferenceScope(oauth.scopes)) {
      continue;
    }

    if (!opts.forceRefresh && !isExpired(oauth.expiresAt)) {
      memoryToken = { accessToken: oauth.accessToken, expiresAt: oauth.expiresAt, source: source.source };
      return { accessToken: oauth.accessToken, source: source.source };
    }

    if (!oauth.refreshToken) {
      continue;
    }

    const refreshed = await refreshClaudeOAuthToken(oauth.refreshToken, oauth, opts.fetchImpl ?? fetch);
    const updatedData = {
      ...(stored.data ?? {}),
      claudeAiOauth: refreshed,
    };
    await writeCredentialSource(source, updatedData);
    memoryToken = { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, source: source.source };
    return { accessToken: refreshed.accessToken, source: source.source };
  }

  throw new Error("Claude subscription is not signed in. Run claude auth login first.");
}

export function getClaudeOAuthBetaHeader(): string {
  return OAUTH_BETA_HEADER;
}

export function defaultCredentialSources(): ClaudeCredentialSource[] {
  const sources: ClaudeCredentialSource[] = [];
  const seen = new Set<string>();
  const addDir = (configDir: string, keychainUsesHash: boolean) => {
    const normalized = configDir.normalize("NFC");
    const service = keychainServiceName(normalized, keychainUsesHash);
    const filePath = join(normalized, ".credentials.json");
    for (const source of [
      { kind: "keychain" as const, service, source: `keychain:${service}` },
      { kind: "file" as const, path: filePath, source: filePath },
    ]) {
      const key = `${source.kind}:${source.kind === "file" ? source.path : source.service}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push(source);
      }
    }
  };

  if (process.env.CLAUDE_CONFIG_DIR) {
    addDir(process.env.CLAUDE_CONFIG_DIR, true);
  }
  addDir(join(homedir(), ".claude"), false);
  if (process.env.KLAUS_CONFIG_DIR) {
    addDir(process.env.KLAUS_CONFIG_DIR, true);
  }
  addDir(join(homedir(), ".klaus"), true);
  return sources;
}

async function refreshClaudeOAuthToken(
  refreshToken: string,
  previous: ClaudeOAuthTokens,
  fetchImpl: FetchLike,
): Promise<ClaudeOAuthTokens> {
  const response = await fetchImpl(CLAUDE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLAUDE_CLIENT_ID,
      scope: CLAUDE_AI_OAUTH_SCOPES.join(" "),
    }),
  });
  if (!response.ok) {
    const text = limitString(await response.text().catch(() => ""), MAX_ERROR_BODY_CHARS);
    throw new Error(`claude oauth ${response.status}${text ? ` - ${text}` : ""}`);
  }

  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!body.access_token) {
    throw new Error("Claude OAuth response missing access_token.");
  }

  return {
    ...previous,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1000,
    scopes: parseScopes(body.scope) ?? previous.scopes,
  };
}

async function readCredentialSource(source: ClaudeCredentialSource): Promise<{ data: SecureStorageData | null }> {
  if (source.kind === "file") {
    try {
      return { data: JSON.parse(await readFile(source.path, "utf8")) as SecureStorageData };
    } catch {
      return { data: null };
    }
  }

  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-a", username(), "-w", "-s", source.service], {
      maxBuffer: MAX_CREDENTIAL_CHARS,
      timeout: 5000,
    });
    return { data: JSON.parse(stdout.trim()) as SecureStorageData };
  } catch {
    return { data: null };
  }
}

async function writeCredentialSource(source: ClaudeCredentialSource, data: SecureStorageData): Promise<void> {
  if (source.kind === "file") {
    await writeFileCredential(source.path, data);
    return;
  }

  const payload = JSON.stringify(data);
  const command = `add-generic-password -U -a "${escapeSecurityToken(username())}" -s "${escapeSecurityToken(source.service)}" -X "${Buffer.from(payload, "utf8").toString("hex")}"\n`;
  if (command.length > KEYCHAIN_STDIN_LINE_LIMIT) {
    throw new Error("Claude OAuth keychain payload is too large to update safely.");
  }

  await runSecurityInteractive(command);
}

async function writeFileCredential(path: string, data: SecureStorageData): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function runSecurityInteractive(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("security", ["-i"], { stdio: ["pipe", "ignore", "pipe"] });
    let stderrTail = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrTail = limitString(`${stderrTail}${chunk.toString()}`, MAX_ERROR_BODY_CHARS);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error(stderrTail.trim() || `security exited with code ${code ?? "unknown"}`));
      }
    });
    child.stdin.write(command);
    child.stdin.end();
  });
}

function hasKeychainEntry(service: string): boolean {
  if (process.platform !== "darwin") {
    return false;
  }

  const result = spawnSync("security", ["find-generic-password", "-a", username(), "-s", service], {
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 1000,
  });
  return result.status === 0;
}

function keychainServiceName(configDir: string, usesHash: boolean): string {
  const dirHash = usesHash ? `-${createHash("sha256").update(configDir).digest("hex").substring(0, 8)}` : "";
  return `Claude Code-credentials${dirHash}`;
}

function hasInferenceScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.includes("user:inference");
}

function isExpired(expiresAt: unknown): boolean {
  return typeof expiresAt === "number" && Number.isFinite(expiresAt) ? expiresAt - TOKEN_REFRESH_BUFFER_MS <= Date.now() : false;
}

function parseScopes(scopeString: unknown): string[] | undefined {
  return typeof scopeString === "string" ? scopeString.split(" ").filter(Boolean) : undefined;
}

function username(): string {
  try {
    return process.env.USER || userInfo().username;
  } catch {
    return "claude-code-user";
  }
}

function escapeSecurityToken(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function limitString(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(-maxChars) : value;
}
