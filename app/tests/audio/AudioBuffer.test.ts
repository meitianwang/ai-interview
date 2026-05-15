import { describe, expect, it } from "vitest";
import { AudioBuffer } from "../../src/main/audio/AudioBuffer";

describe("AudioBuffer", () => {
  it("accepts silence and computes zero RMS", () => {
    const buffer = new AudioBuffer();
    buffer.push(Buffer.alloc(200 * 2));

    expect(buffer.rmsLevel()).toBe(0);
  });

  it("yields larger RMS for louder signal", () => {
    const buffer = new AudioBuffer();
    const loud = Buffer.alloc(200 * 2);
    for (let i = 0; i < loud.length; i += 2) {
      loud.writeInt16LE(8_000, i);
    }

    buffer.push(loud);

    expect(buffer.rmsLevel()).toBeGreaterThan(0.1);
  });

  it("keeps only the bounded rolling window", () => {
    const buffer = new AudioBuffer();
    const chunk = Buffer.alloc(16_000 * 35 * 2);

    buffer.push(chunk);

    expect(buffer.latestSamples(16_000 * 40)).toHaveLength(16_000 * 30);
  });
});
