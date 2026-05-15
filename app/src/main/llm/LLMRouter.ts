import { EventEmitter } from "node:events";
import type { LLMClient, LLMTokenEvent } from "./LLMClient";

export class LLMRouter extends EventEmitter {
  private readonly timeoutMs: number;

  constructor(
    private readonly clients: { primary: LLMClient; fallback: LLMClient },
    options: { timeoutMs?: number } = {},
  ) {
    super();
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async route(prompt: { system: string; user: string }): Promise<void> {
    const primarySucceeded = await this.tryClient(this.clients.primary, prompt);
    if (!primarySucceeded) {
      this.emit("fallback", { from: this.clients.primary.name, to: this.clients.fallback.name });
      await this.tryClient(this.clients.fallback, prompt);
    }
    this.emit("done");
  }

  abort(): void {
    this.clients.primary.abort();
    this.clients.fallback.abort();
  }

  private tryClient(client: LLMClient, prompt: { system: string; user: string }): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let gotToken = false;
      const cleanup = () => {
        clearTimeout(timeout);
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

      client.on("token", onToken);
      client.once("done", onDone);
      client.once("error", onError);
      client.stream(prompt, { timeoutMs: this.timeoutMs }).catch(onError);
    });
  }
}
