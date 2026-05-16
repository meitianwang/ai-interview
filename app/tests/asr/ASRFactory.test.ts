import { describe, expect, it } from "vitest";
import { createASRClient } from "../../src/main/asr/ASRFactory";
import { HuoshanASRClient } from "../../src/main/asr/HuoshanASRClient";

describe("createASRClient", () => {
  it("returns HuoshanASRClient when provider is huoshan", () => {
    expect(
      createASRClient({
        provider: "huoshan",
        url: "wss://example.test",
        appId: "app",
        token: "token",
        sampleRate: 16_000,
        language: "zh-CN",
      }),
    ).toBeInstanceOf(HuoshanASRClient);
  });
});
