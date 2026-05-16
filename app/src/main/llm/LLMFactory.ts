import type { Settings } from "../secrets/SecretStore";
import { ClaudeClient } from "./ClaudeClient";
import { hasClaudeOAuthCredentials } from "./ClaudeOAuth";
import { ClaudeSubscriptionClient } from "./ClaudeSubscriptionClient";
import { hasCodexCliAuth } from "./CodexAuth";
import { CodexSubscriptionClient } from "./CodexSubscriptionClient";
import type { LLMClient } from "./LLMClient";
import { MockLLMClient } from "./MockLLMClient";
import { OpenAIClient } from "./OpenAIClient";

export function createLLMClients(settings: Pick<Settings, "anthropicKey" | "llmProvider" | "openaiKey">): {
  primary: LLMClient;
  fallback: LLMClient;
} {
  const provider = settings.llmProvider;
  const anthropicApi = createAnthropicApiClient(settings);
  const openaiApi = createOpenAIApiClient(settings);
  const codexSubscription = () => new CodexSubscriptionClient({ model: process.env.CODEX_MODEL ?? "gpt-5.4" });
  const claudeSubscription = () =>
    new ClaudeSubscriptionClient({
      model: process.env.CLAUDE_SUBSCRIPTION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    });

  if (provider === "api") {
    return apiClientsOrMock(anthropicApi, openaiApi);
  }

  if (provider === "codex-subscription") {
    return {
      primary: codexSubscription(),
      fallback: firstClient(anthropicApi, openaiApi, hasClaudeOAuthCredentials() ? claudeSubscription() : null) ?? new MockLLMClient(),
    };
  }

  if (provider === "claude-subscription") {
    return {
      primary: claudeSubscription(),
      fallback: firstClient(hasCodexCliAuth() ? codexSubscription() : null, anthropicApi, openaiApi) ?? new MockLLMClient(),
    };
  }

  return autoClients({ anthropicApi, claudeSubscription, codexSubscription, openaiApi });
}

export function createClassifierLLMClient(settings: Pick<Settings, "anthropicKey" | "llmProvider" | "openaiKey">): LLMClient | null {
  const anthropicApi = createAnthropicApiClient(settings);
  const openaiApi = createOpenAIApiClient(settings);

  if (settings.llmProvider === "api") {
    return firstClient(anthropicApi, openaiApi);
  }
  if (settings.llmProvider === "codex-subscription" || (settings.llmProvider === "auto" && !anthropicApi && !openaiApi && hasCodexCliAuth())) {
    return new CodexSubscriptionClient({ model: process.env.CODEX_MODEL ?? "gpt-5.4-mini" });
  }

  return firstClient(anthropicApi, openaiApi);
}

function autoClients(opts: {
  anthropicApi: LLMClient | null;
  claudeSubscription: () => LLMClient;
  codexSubscription: () => LLMClient;
  openaiApi: LLMClient | null;
}): { primary: LLMClient; fallback: LLMClient } {
  if (opts.anthropicApi) {
    return {
      primary: opts.anthropicApi,
      fallback: opts.openaiApi ?? new MockLLMClient("备用答案：请补充 OpenAI API key。"),
    };
  }

  if (opts.openaiApi) {
    return {
      primary: opts.openaiApi,
      fallback: hasCodexCliAuth() ? opts.codexSubscription() : new MockLLMClient("备用答案：请补充 Anthropic API key。"),
    };
  }

  if (hasCodexCliAuth()) {
    return {
      primary: opts.codexSubscription(),
      fallback: hasClaudeOAuthCredentials() ? opts.claudeSubscription() : new MockLLMClient("备用答案：请登录 Claude Code。"),
    };
  }

  if (hasClaudeOAuthCredentials()) {
    return {
      primary: opts.claudeSubscription(),
      fallback: new MockLLMClient("备用答案：请登录 Codex 或配置 API key。"),
    };
  }

  return {
    primary: new MockLLMClient(),
    fallback: new MockLLMClient("备用答案：请先补充 API key，或登录本机 Codex/Claude。"),
  };
}

function apiClientsOrMock(anthropicApi: LLMClient | null, openaiApi: LLMClient | null): { primary: LLMClient; fallback: LLMClient } {
  if (anthropicApi) {
    return {
      primary: anthropicApi,
      fallback: openaiApi ?? new MockLLMClient("备用答案：请补充 OpenAI API key。"),
    };
  }

  if (openaiApi) {
    return {
      primary: openaiApi,
      fallback: new MockLLMClient("备用答案：请补充 Anthropic API key。"),
    };
  }

  return {
    primary: new MockLLMClient(),
    fallback: new MockLLMClient("备用答案：请先补充 API key。"),
  };
}

function createAnthropicApiClient(settings: Pick<Settings, "anthropicKey">): LLMClient | null {
  const anthropicKey = settings.anthropicKey || process.env.ANTHROPIC_API_KEY;
  return anthropicKey
    ? new ClaudeClient({
        apiKey: anthropicKey,
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      })
    : null;
}

function createOpenAIApiClient(settings: Pick<Settings, "openaiKey">): LLMClient | null {
  const openaiKey = settings.openaiKey || process.env.OPENAI_API_KEY;
  return openaiKey
    ? new OpenAIClient({
        apiKey: openaiKey,
        model: process.env.OPENAI_MODEL ?? "gpt-5.4",
      })
    : null;
}

function firstClient(...clients: Array<LLMClient | null>): LLMClient | null {
  return clients.find((client): client is LLMClient => Boolean(client)) ?? null;
}
