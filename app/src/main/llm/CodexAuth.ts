import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_ERROR_BODY_CHARS = 8 * 1024;

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

interface CodexAuthJson {
  auth_mode?: unknown;
  last_refresh?: unknown;
  tokens?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CodexAccessToken {
  accessToken: string;
  accountId: string;
  account?: string;
}

type FetchLike = typeof fetch;

const accessTokenCache = new Map<string, { token: string; accountId: string; account?: string; expiresAt: number }>();

export function getCodexCliAuthPath(): string {
  const codexHome = firstNonEmptyString(process.env.CODEX_HOME) ?? join(homedir(), ".codex");
  return join(codexHome, "auth.json");
}

export function hasCodexCliAuth(authPath = getCodexCliAuthPath()): boolean {
  return existsSync(authPath);
}

export async function getCodexAccessToken(opts: { authPath?: string; fetchImpl?: FetchLike } = {}): Promise<CodexAccessToken> {
  const authPath = opts.authPath ?? getCodexCliAuthPath();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const parsed = await readCodexAuthJson(authPath);
  if (parsed.auth_mode !== "chatgpt") {
    const mode = firstNonEmptyString(parsed.auth_mode) ?? "unknown";
    throw new Error(`Unsupported Codex auth mode "${mode}". Run codex login with ChatGPT auth first.`);
  }

  const tokens = parsed.tokens && typeof parsed.tokens === "object" ? parsed.tokens : null;
  const refreshToken = firstNonEmptyString(tokens?.refresh_token);
  if (!refreshToken) {
    throw new Error("Codex auth.json does not contain a refresh token. Run codex login again.");
  }

  const accessToken = firstNonEmptyString(tokens?.access_token);
  const identity = extractIdentity({
    access_token: accessToken ?? "",
    id_token: firstNonEmptyString(tokens?.id_token),
    refresh_token: refreshToken,
  });
  const accountId =
    identity.accountId ??
    firstNonEmptyString(
      tokens?.account_id,
      tokens?.accountId,
      tokens?.chatgpt_account_id,
      parsed.account_id,
      parsed.accountId,
      parsed.chatgpt_account_id,
    );

  if (!accountId) {
    throw new Error("Unable to read ChatGPT account id from Codex auth.json.");
  }

  const cacheKey = `${authPath}:${accountId}`;
  const cached = accessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    return { accessToken: cached.token, account: cached.account, accountId: cached.accountId };
  }

  const accessTokenExpiresAt = accessToken ? jwtExpiresAt(accessToken) : undefined;
  if (accessToken && accessTokenExpiresAt && accessTokenExpiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    accessTokenCache.set(cacheKey, {
      token: accessToken,
      accountId,
      account: identity.email,
      expiresAt: accessTokenExpiresAt,
    });
    return { accessToken, account: identity.email, accountId };
  }

  const refreshed = await refreshWithToken(refreshToken, fetchImpl);
  const refreshedIdentity = extractIdentity(refreshed);
  const nextAccountId = refreshedIdentity.accountId ?? accountId;
  const nextRefreshToken = refreshed.refresh_token ?? refreshToken;
  const nextExpiresAt = tokenExpiresAt(refreshed.expires_in);

  await writeUpdatedAuthJson(authPath, parsed, {
    accessToken: refreshed.access_token,
    accountId: nextAccountId,
    idToken: refreshed.id_token,
    refreshToken: nextRefreshToken,
  });

  accessTokenCache.set(`${authPath}:${nextAccountId}`, {
    token: refreshed.access_token,
    accountId: nextAccountId,
    account: refreshedIdentity.email ?? identity.email,
    expiresAt: nextExpiresAt,
  });
  return {
    accessToken: refreshed.access_token,
    account: refreshedIdentity.email ?? identity.email,
    accountId: nextAccountId,
  };
}

async function readCodexAuthJson(authPath: string): Promise<CodexAuthJson> {
  try {
    const raw = await readFile(authPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Codex auth.json is not an object: ${authPath}`);
    }
    return parsed as CodexAuthJson;
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new Error(`No Codex auth.json found at ${authPath}. Run codex login first.`);
    }
    throw error;
  }
}

async function refreshWithToken(refreshToken: string, fetchImpl: FetchLike): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CODEX_CLIENT_ID,
    scope: "openid profile email",
  });
  const response = await fetchImpl(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ai-interview-codex-subscription",
    },
    body,
  });
  if (!response.ok) {
    const text = limitString(await response.text().catch(() => ""), MAX_ERROR_BODY_CHARS);
    throw new Error(`codex oauth ${response.status}${text ? ` - ${text}` : ""}`);
  }

  const tokens = (await response.json()) as OAuthTokenResponse;
  if (!tokens.access_token) {
    throw new Error("Codex OAuth response missing access_token.");
  }
  return tokens;
}

async function writeUpdatedAuthJson(
  authPath: string,
  parsed: CodexAuthJson,
  next: { accessToken: string; accountId: string; idToken?: string; refreshToken: string },
): Promise<void> {
  const tokens = parsed.tokens && typeof parsed.tokens === "object" ? { ...parsed.tokens } : {};
  tokens.access_token = next.accessToken;
  tokens.account_id = next.accountId;
  tokens.refresh_token = next.refreshToken;
  if (next.idToken) {
    tokens.id_token = next.idToken;
  }

  await writeFile(
    authPath,
    JSON.stringify(
      {
        ...parsed,
        auth_mode: "chatgpt",
        last_refresh: new Date().toISOString(),
        tokens,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

function extractIdentity(tokens: Partial<OAuthTokenResponse>): { accountId?: string; email?: string } {
  const claims = [tokens.id_token, tokens.access_token]
    .filter((token): token is string => typeof token === "string" && token.length > 0)
    .map(decodeJwtPayload)
    .filter((claim): claim is Record<string, any> => Boolean(claim));

  let accountId: string | undefined;
  let email: string | undefined;
  for (const claim of claims) {
    accountId ||=
      firstNonEmptyString(
        claim.chatgpt_account_id,
        claim["https://api.openai.com/auth"]?.chatgpt_account_id,
        Array.isArray(claim.organizations) ? claim.organizations.find((org: any) => org?.id)?.id : undefined,
      );
    email ||= firstNonEmptyString(claim.email);
  }
  return { accountId, email };
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function tokenExpiresAt(expiresIn: unknown): number {
  const seconds = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 3600;
  return Date.now() + seconds * 1000;
}

function jwtExpiresAt(token: string): number | undefined {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function limitString(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(-maxChars) : value;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
