export type VADResult = "voiced" | "silent";

export interface EnergyVADOptions {
  threshold?: number;
}

export class EnergyVADProcessor {
  private readonly threshold: number;

  constructor(options: EnergyVADOptions = {}) {
    this.threshold = options.threshold ?? 0.02;
  }

  process(pcm: Int16Array): VADResult {
    if (pcm.length === 0) {
      return "silent";
    }

    let sum = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      sum += pcm[i] * pcm[i];
    }

    const rms = Math.sqrt(sum / pcm.length) / 32768;
    return rms >= this.threshold ? "voiced" : "silent";
  }

  processBuffer(pcm16le: Buffer): VADResult {
    return this.process(pcm16leBufferToInt16Array(pcm16le));
  }
}

export function pcm16leBufferToInt16Array(buffer: Buffer): Int16Array {
  const sampleCount = Math.floor(buffer.byteLength / 2);
  const samples = new Int16Array(sampleCount);
  const view = new DataView(buffer.buffer, buffer.byteOffset, sampleCount * 2);

  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = view.getInt16(i * 2, true);
  }

  return samples;
}
