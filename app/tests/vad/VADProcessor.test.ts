import { describe, expect, it } from "vitest";
import { EnergyVADProcessor, pcm16leBufferToInt16Array } from "../../src/main/vad/VADProcessor";

describe("EnergyVADProcessor", () => {
  it("reports voiced when RMS exceeds threshold", () => {
    const vad = new EnergyVADProcessor({ threshold: 0.05 });
    const loud = new Int16Array(1600);
    loud.fill(5000);

    expect(vad.process(loud)).toBe("voiced");
  });

  it("reports silent when RMS is below threshold", () => {
    const vad = new EnergyVADProcessor({ threshold: 0.05 });
    const silence = new Int16Array(1600);

    expect(vad.process(silence)).toBe("silent");
  });

  it("reports silent for empty frames", () => {
    const vad = new EnergyVADProcessor({ threshold: 0.05 });

    expect(vad.process(new Int16Array())).toBe("silent");
  });

  it("reads little-endian PCM buffers", () => {
    const buffer = Buffer.alloc(4);
    buffer.writeInt16LE(5000, 0);
    buffer.writeInt16LE(-5000, 2);

    expect(Array.from(pcm16leBufferToInt16Array(buffer))).toEqual([5000, -5000]);
    expect(new EnergyVADProcessor({ threshold: 0.05 }).processBuffer(buffer)).toBe("voiced");
  });
});
