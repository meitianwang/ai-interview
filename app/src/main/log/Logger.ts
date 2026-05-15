import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";

export interface LogEntry {
  ts: number;
  level: "info" | "warn" | "error";
  module: string;
  type: string;
  meta?: Record<string, unknown>;
}

const SENSITIVE_KEY = /transcript|ocr|pcm|prompt|answer|resume|jd|token|secret|api.?key/i;
const MAX_STRING_LENGTH = 512;
const MAX_LINE_LENGTH = 8192;
const MAX_DEPTH = 4;

export class Logger {
  private readonly stream: WriteStream;

  constructor(filepath: string) {
    mkdirSync(dirname(filepath), { recursive: true });
    this.stream = createWriteStream(filepath, { flags: "a" });
  }

  log(entry: Omit<LogEntry, "ts">): void {
    const safe: LogEntry = {
      ...entry,
      meta: entry.meta ? sanitizeRecord(entry.meta, 0, new WeakSet()) : undefined,
      ts: Date.now(),
    };
    const line = JSON.stringify(safe);
    if (line.length <= MAX_LINE_LENGTH) {
      this.stream.write(`${line}\n`);
      return;
    }

    this.stream.write(
      `${JSON.stringify({
        level: safe.level,
        meta: { truncated: true },
        module: safe.module,
        ts: safe.ts,
        type: safe.type,
      })}\n`,
    );
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.once("error", reject);
      this.stream.end(resolve);
    });
  }
}

function sanitizeRecord(record: Record<string, unknown>, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  if (seen.has(record) || depth > MAX_DEPTH) {
    return { truncated: true };
  }

  seen.add(record);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEY.test(key)) {
      continue;
    }

    sanitized[key] = sanitizeValue(value, depth + 1, seen);
  }

  return sanitized;
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return truncate(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return { bytes: value.byteLength };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1, seen));
  }
  if (typeof value === "object" && value !== null) {
    return sanitizeRecord(value as Record<string, unknown>, depth, seen);
  }

  return String(value);
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}
