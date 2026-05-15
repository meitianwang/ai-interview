export interface Segment {
  text: string;
  ts: number;
}

export class TranscriptStore {
  private committed: Segment[] = [];
  private live = "";
  private readonly windowMs: number;

  constructor(options: { windowMs?: number } = {}) {
    this.windowMs = options.windowMs ?? 5 * 60 * 1000;
  }

  applyPartial(text: string, _ts: number): void {
    this.live = text;
  }

  applyFinal(text: string, ts: number): void {
    this.committed.push({ text, ts });
    this.live = "";
    this.trim(ts);
  }

  snapshot(): string {
    return `${this.committed.map((segment) => segment.text).join("")}${this.live}`;
  }

  tail(count: number): string {
    const snapshot = this.snapshot();
    return snapshot.slice(Math.max(0, snapshot.length - count));
  }

  committedSegments(): Segment[] {
    return [...this.committed];
  }

  private trim(now: number): void {
    this.committed = this.committed.filter((segment) => now - segment.ts <= this.windowMs);
  }
}
