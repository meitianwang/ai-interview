import { EventEmitter } from "node:events";
import type { LLMClient, LLMTokenEvent } from "./LLMClient";

export class LLMRouter extends EventEmitter {
  private readonly timeoutMs: number;
  private abortActiveClient: (() => void) | null = null;
  private aborted = false;

  constructor(
    private clients: { primary: LLMClient; fallback: LLMClient },
    options: { timeoutMs?: number } = {},
  ) {
    super();
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  updateClients(clients: { primary: LLMClient; fallback: LLMClient }): void {
    this.abort();
    this.clients = clients;
  }

  async route(prompt: { system: string; user: string }): Promise<void> {
    this.aborted = false;
    const primarySucceeded = await this.tryClient(this.clients.primary, prompt);
    if (this.aborted) {
      return;
    }
    if (!primarySucceeded) {
      this.emit("fallback", { from: this.clients.primary.name, to: this.clients.fallback.name });
      await this.tryClient(this.clients.fallback, prompt);
      if (this.aborted) {
        return;
      }
    }
    this.emit("done");
  }

  abort(): void {
    this.aborted = true;
    this.clients.primary.abort();
    this.clients.fallback.abort();
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
