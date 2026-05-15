import type { VADResult } from "../vad/VADProcessor";

const QUESTION_HINTS = ["?", "？", "吗", "呢", "怎么", "如何", "为什么", "什么", "请", "介绍", "讲一下", "聊聊"];

export interface TriggerLogicOptions {
  silenceMs: number;
  onTrigger: () => void;
  minTailChars?: number;
}

export class TriggerLogic {
  private lastVoicedTs: number | null = null;
  private silenceStartTs: number | null = null;
  private transcriptTail = "";

  constructor(private readonly options: TriggerLogicOptions) {}

  onVAD(state: VADResult, ts: number): void {
    if (state === "voiced") {
      this.lastVoicedTs = ts;
      this.silenceStartTs = null;
      return;
    }

    if (this.lastVoicedTs !== null && this.silenceStartTs === null) {
      this.silenceStartTs = ts;
    }
  }

  updateTranscriptTail(transcriptTail: string): void {
    this.transcriptTail = transcriptTail.trim();
  }

  tick(nowTs: number): void {
    if (this.lastVoicedTs === null || this.silenceStartTs === null) {
      return;
    }
    if (nowTs - this.silenceStartTs < this.options.silenceMs) {
      return;
    }
    if (this.transcriptTail.length < (this.options.minTailChars ?? 8)) {
      return;
    }
    if (!QUESTION_HINTS.some((hint) => this.transcriptTail.includes(hint))) {
      return;
    }

    this.options.onTrigger();
    this.lastVoicedTs = null;
    this.silenceStartTs = null;
  }
}
