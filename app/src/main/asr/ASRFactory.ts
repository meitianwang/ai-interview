import type { ASRClient } from "./ASRClient";
import { HuoshanASRClient, type HuoshanConfig } from "./HuoshanASRClient";
import { MockASRClient, type MockScriptItem } from "./MockASRClient";

export type ASRConfig =
  | { provider: "mock"; script: MockScriptItem[] }
  | ({ provider: "huoshan" } & HuoshanConfig);

export function createASRClient(config: ASRConfig): ASRClient {
  if (config.provider === "mock") {
    return new MockASRClient({ script: config.script });
  }
  if (config.provider === "huoshan") {
    return new HuoshanASRClient(config);
  }

  throw new Error(`unknown ASR provider: ${(config as { provider?: string }).provider}`);
}
