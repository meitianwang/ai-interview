import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";

const MAX_STDERR_CHARS = 8 * 1024;
const MAX_STDOUT_BUFFER_CHARS = 64 * 1024;

interface SpawnedProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: (chunk: string) => void;
    end: () => void;
  };
  kill: (signal?: NodeJS.Signals) => boolean;
}

type SpawnClaude = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => SpawnedProcess;

export class ClaudeSubscriptionClient extends EventEmitter implements LLMClient {
  name = "claude-subscription";
  private child: SpawnedProcess | null = null;

  constructor(
    private readonly config: {
      command?: string;
      cwd?: string;
      model: string;
      spawnImpl?: SpawnClaude;
    },
  ) {
    super();
  }

  async stream(prompt: { system: string; user: string }, options: { timeoutMs: number }): Promise<void> {
    this.abort();
    const spawnImpl = this.config.spawnImpl ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions) as unknown as SpawnedProcess);
    const child = spawnImpl(this.config.command ?? "claude", buildClaudeArgs(this.config.model), {
      cwd: this.config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    let settled = false;
    let stdoutBuffer = "";
    let stderrTail = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs);

    const settle = (ok: boolean, error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      if (this.child === child) {
        this.child = null;
      }
      if (ok) {
        this.emit("done");
      } else {
        this.emit("error", error ?? new Error("Claude subscription request failed"));
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBuffer = limitString(`${stdoutBuffer}${chunk.toString()}`, MAX_STDOUT_BUFFER_CHARS);
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        handleClaudeJsonLine(line, (text) => this.emit("token", { text }));
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrTail = limitString(`${stderrTail}${chunk.toString()}`, MAX_STDERR_CHARS);
    });
    child.once("error", (error) => settle(false, error instanceof Error ? error : new Error(String(error))));
    child.once("close", (code, signal) => {
      if (stdoutBuffer.trim()) {
        handleClaudeJsonLine(stdoutBuffer, (text) => this.emit("token", { text }));
      }
      if (code === 0) {
        settle(true);
        return;
      }

      const reason = stderrTail.trim() || `claude exited with code ${code ?? "unknown"}${signal ? ` signal ${signal}` : ""}`;
      settle(false, new Error(reason));
    });

    child.stdin.write(formatClaudePrompt(prompt));
    child.stdin.end();
  }

  abort(): void {
    this.child?.kill("SIGTERM");
    this.child = null;
  }
}

export function isClaudeCliAvailable(command = process.env.CLAUDE_BIN ?? "claude", pathValue = process.env.PATH ?? ""): boolean {
  if (command.includes("/") || command.includes("\\")) {
    return existsSync(command);
  }

  const paths = [...pathValue.split(delimiter), "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean);
  return paths.some((dir) => existsSync(join(dir, command)));
}

function buildClaudeArgs(model: string): string[] {
  return [
    "-p",
    "--verbose",
    "--output-format",
    "stream-json",
    "--input-format",
    "text",
    "--include-partial-messages",
    "--no-session-persistence",
    "--model",
    model,
    "--tools",
    "",
    "--setting-sources",
    "local",
    "--disable-slash-commands",
  ];
}

function formatClaudePrompt(prompt: { system: string; user: string }): string {
  return `<system>\n${prompt.system}\n</system>\n\n${prompt.user}`;
}

function handleClaudeJsonLine(line: string, onToken: (text: string) => void): void {
  if (!line.trim()) {
    return;
  }

  try {
    const parsed = JSON.parse(line);
    const event = parsed?.type === "stream_event" ? parsed.event : parsed;
    if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
      onToken(event.delta.text);
    }
  } catch {
    // Ignore hook/status lines that are not JSON payloads.
  }
}

function limitString(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(-maxChars) : value;
}
