import type { ASRClient } from "./ASRClient";
import { HuoshanASRClient, type HuoshanConfig } from "./HuoshanASRClient";

export type ASRConfig = { provider: "huoshan" } & HuoshanConfig;

export function createASRClient(config: ASRConfig): ASRClient {
  return new HuoshanASRClient(config);
}
