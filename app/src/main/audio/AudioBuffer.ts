export class AudioBuffer {
  private static readonly maxKeepSamples = 16_000 * 30;
  private samples = new Int16Array(0);

  push(chunk: Buffer): void {
    const byteLength = chunk.byteLength - (chunk.byteLength % 2);
    if (byteLength === 0) {
      return;
    }

    const newSamples = new Int16Array(chunk.buffer, chunk.byteOffset, byteLength / 2);
    const merged = new Int16Array(this.samples.length + newSamples.length);
    merged.set(this.samples, 0);
    merged.set(newSamples, this.samples.length);
    this.samples =
      merged.length > AudioBuffer.maxKeepSamples
        ? merged.slice(merged.length - AudioBuffer.maxKeepSamples)
        : merged;
  }

  rmsLevel(): number {
    if (this.samples.length === 0) {
      return 0;
    }

    const window = this.samples.slice(Math.max(0, this.samples.length - 3_200));
    let sum = 0;
    for (const sample of window) {
      sum += sample * sample;
    }

    return Math.min(1, Math.sqrt(sum / window.length) / 32_768);
  }

  latestSamples(count: number): Int16Array {
    return this.samples.slice(Math.max(0, this.samples.length - count));
  }
}
