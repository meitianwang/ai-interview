import { EventEmitter } from "node:events";
import type { LLMClient, LLMClientSet, LLMTokenEvent } from "./LLMClient";

export class LLMRouter extends EventEmitter {
  private readonly timeoutMs: number;
  private abortActiveClient: (() => void) | null = null;
  private aborted = false;

  constructor(
    private clients: LLMClientSet,
    options: { timeoutMs?: number } = {},
  ) {
    super();
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  updateClients(clients: LLMClientSet): void {
    this.abort();
    this.clients = clients;
  }

  async route(prompt: { system: string; user: string }): Promise<void> {
    this.aborted = false;
    const primary = this.clients.primary;
    if (!primary) {
      this.emit("client-error", { client: "none", error: new Error("没有可用的真实 LLM 配置") });
      this.emit("done");
      return;
    }

    const primarySucceeded = await this.tryClient(primary, prompt);
    if (this.aborted) {
      return;
    }
    if (!primarySucceeded) {
      const fallback = this.clients.fallback;
      if (!fallback) {
        this.emit("client-error", { client: primary.name, error: new Error("主模型失败，且没有可用的真实备用 LLM") });
        this.emit("done");
        return;
      }

      this.emit("fallback", { from: primary.name, to: fallback.name });
      await this.tryClient(fallback, prompt);
      if (this.aborted) {
        return;
      }
    }
    this.emit("done");
  }

  abort(): void {
    this.aborted = true;
    this.clients.primary?.abort();
    this.clients.fallback?.abort();
    this.abortActiveClient?.();
    this.abortActiveClient = null;
  }

  private tryClient(client: LLMClient, prompt: { system: string; user: string }): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let gotToken = false;
      const cleanup = () => {
        clearTimeout(timeout);
        if (this.abortActiveClient === abortCurrentClient) {
          this.abortActiveClient = null;
        }
        client.off("token", onToken);
        client.off("done", onDone);
        client.off("error", onError);
      };
      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(ok);
      };
      const onToken = (event: LLMTokenEvent) => {
        gotToken = true;
        this.emit("token", event);
      };
      const onDone = () => finish(gotToken);
      const onError = (error: unknown) => {
        this.emit("client-error", { client: client.name, error });
        finish(false);
      };
      const timeout = setTimeout(() => {
        client.abort();
        finish(false);
      }, this.timeoutMs);
      const abortCurrentClient = () => finish(false);

      this.abortActiveClient = abortCurrentClient;
      client.on("token", onToken);
      client.once("done", onDone);
      client.once("error", onError);
      client.stream(prompt, { timeoutMs: this.timeoutMs }).catch(onError);
    });
  }
}
