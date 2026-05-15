import { EventEmitter } from "node:events";

export interface LLMTokenEvent {
  text: string;
}

export interface LLMClient extends EventEmitter {
  name: string;
  stream(prompt: { system: string; user: string }, options: { timeoutMs: number }): Promise<void>;
  abort(): void;
}
