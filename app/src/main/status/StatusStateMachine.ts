export type StatusLevel = "green" | "yellow" | "orange" | "red";

const SEVERITY: Record<string, StatusLevel> = {
  "asr.fallback": "yellow",
  "asr.reconnecting": "yellow",
  "llm.fallback": "yellow",
  "asr.failed": "orange",
  "llm.failed": "orange",
  "audio.failed": "red",
  "ipc.disconnected": "red",
};

const RANK: StatusLevel[] = ["green", "yellow", "orange", "red"];

export class StatusStateMachine {
  private readonly active = new Set<string>();

  report(event: string): boolean {
    const hadEvent = this.active.has(event);
    this.active.add(event);
    return !hadEvent;
  }

  clear(event: string): boolean {
    return this.active.delete(event);
  }

  level(): StatusLevel {
    let max: StatusLevel = "green";
    for (const event of this.active) {
      const severity = SEVERITY[event] ?? "yellow";
      if (rank(severity) > rank(max)) {
        max = severity;
      }
    }

    return max;
  }
}

function rank(level: StatusLevel): number {
  return RANK.indexOf(level);
}
