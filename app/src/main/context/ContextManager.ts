import type { TranscriptStore } from "../asr/TranscriptStore";

export interface Context {
  resume: string;
  jd: string;
  ocr: string;
  transcript: string;
  history: Array<{ q: string; a: string }>;
}

export class ContextManager {
  private resume = "";
  private jd = "";
  private ocr = "";
  private history: Array<{ q: string; a: string }> = [];
  private readonly transcriptStore: TranscriptStore;

  constructor(init: { resume?: string; jd?: string; ocr?: string; transcriptStore: TranscriptStore }) {
    this.resume = init.resume ?? "";
    this.jd = init.jd ?? "";
    this.ocr = init.ocr ?? "";
    this.transcriptStore = init.transcriptStore;
  }

  updateResume(resume: string): void {
    this.resume = resume;
  }

  updateJD(jd: string): void {
    this.jd = jd;
  }

  updateOCR(ocr: string): void {
    this.ocr = ocr;
  }

  appendHistory(q: string, a: string): void {
    this.history.push({ q, a });
    if (this.history.length > 10) {
      this.history.shift();
    }
  }

  buildContext(options: { transcriptTailSeconds?: number } = {}): Context {
    const tailChars = (options.transcriptTailSeconds ?? 30) * 4;
    return {
      resume: this.resume,
      jd: this.jd,
      ocr: this.ocr,
      transcript: this.transcriptStore.tail(tailChars),
      history: [...this.history],
    };
  }
}
