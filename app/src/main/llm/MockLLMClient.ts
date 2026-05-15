import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";

export class MockLLMClient extends EventEmitter implements LLMClient {
  name = "mock";
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly text = "先用 3 点回答：\n- 简明介绍背景\n- 对齐岗位需求\n- 用项目结果收尾") {
    super();
  }

  async stream(_prompt: { system: string; user: string }, _options: { timeoutMs: number }): Promise<void> {
    this.abort();
    const chunks = this.text.match(/.{1,4}/g) ?? [this.text];
    chunks.forEach((chunk, index) => {
      const timer = setTimeout(() => {
        this.emit("token", { text: chunk });
        if (index === chunks.length - 1) {
          this.emit("done");
        }
      }, index * 20);
      this.timers.push(timer);
    });
  }

  abort(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
  }
}
