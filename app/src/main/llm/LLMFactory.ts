import type { Settings } from "../secrets/SecretStore";
import { ClaudeClient } from "./ClaudeClient";
import { hasClaudeOAuthCredentials } from "./ClaudeOAuth";
import { ClaudeSubscriptionClient } from "./ClaudeSubscriptionClient";
import { hasCodexCliAuth } from "./CodexAuth";
import { CodexSubscriptionClient } from "./CodexSubscriptionClient";
import type { LLMClient, LLMClientSet } from "./LLMClient";
import { OpenAIClient } from "./OpenAIClient";

export function createLLMClients(settings: Pick<Settings, "anthropicKey" | "llmProvider" | "openaiKey">): LLMClientSet {
  const provider = settings.llmProvider;
  const anthropicApi = createAnthropicApiClient(settings);
  const openaiApi = createOpenAIApiClient(settings);
  const codexSubscription = () => new CodexSubscriptionClient({ model: process.env.CODEX_MODEL ?? "gpt-5.4" });
  const claudeSubscription = () =>
    new ClaudeSubscriptionClient({
      model: process.env.CLAUDE_SUBSCRIPTION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    });

  if (provider === "api") {
    return apiClients(anthropicApi, openaiApi);
  }

  if (provider === "codex-subscription") {
    return {
      primary: hasCodexCliAuth() ? codexSubscription() : null,
      fallback: firstClient(anthropicApi, openaiApi, hasClaudeOAuthCredentials() ? claudeSubscription() : null),
    };
  }

  if (provider === "claude-subscription") {
    return {
      primary: hasClaudeOAuthCredentials() ? claudeSubscription() : null,
      fallback: firstClient(hasCodexCliAuth() ? codexSubscription() : null, anthropicApi, openaiApi),
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
}): LLMClientSet {
  if (opts.anthropicApi) {
    return {
      primary: opts.anthropicApi,
      fallback: opts.openaiApi,
    };
  }

  if (opts.openaiApi) {
    return {
      primary: opts.openaiApi,
      fallback: hasCodexCliAuth() ? opts.codexSubscription() : null,
    };
  }

  if (hasCodexCliAuth()) {
    return {
      primary: opts.codexSubscription(),
      fallback: hasClaudeOAuthCredentials() ? opts.claudeSubscription() : null,
    };
  }

  if (hasClaudeOAuthCredentials()) {
    return {
      primary: opts.claudeSubscription(),
      fallback: null,
    };
  }

  return {
    primary: null,
    fallback: null,
  };
}

function apiClients(anthropicApi: LLMClient | null, openaiApi: LLMClient | null): LLMClientSet {
  if (anthropicApi) {
    return {
      primary: anthropicApi,
      fallback: openaiApi,
    };
  }

  if (openaiApi) {
    return {
      primary: openaiApi,
      fallback: null,
    };
  }

  return {
    primary: null,
    fallback: null,
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
