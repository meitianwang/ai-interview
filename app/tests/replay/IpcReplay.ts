import { readFile } from "node:fs/promises";

export interface ReplayedEvent {
  delayMs: number;
  line: string;
}

export async function loadSession(path: string): Promise<ReplayedEvent[]> {
  const raw = await readFile(path, "utf8");
  const content = raw.trim();
  if (!content) {
    return [];
  }

  return content.split("\n").map((line) => {
    const parsed: unknown = JSON.parse(line);
    if (!isReplayRecord(parsed)) {
      throw new Error(`invalid replay line: ${line}`);
    }

    return {
      delayMs: parsed.delayMs ?? 0,
      line: JSON.stringify(parsed.message),
    };
  });
}

export async function playInto(events: ReplayedEvent[], emit: (line: string) => void): Promise<void> {
  for (const event of events) {
    await delay(event.delayMs);
    emit(event.line);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReplayRecord(value: unknown): value is { delayMs?: number; message: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    (!("delayMs" in value) || typeof value.delayMs === "number")
  );
}
