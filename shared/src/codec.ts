import type { ElectronCommand, SidecarEvent } from "./ipc-schema";

export type AnyMessage = SidecarEvent | ElectronCommand;

export function encodeMessage(msg: AnyMessage): Buffer {
  return Buffer.from(`${JSON.stringify(msg)}\n`, "utf8");
}

export function decodeMessage(line: string): AnyMessage {
  const parsed = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || parsed.v !== 1) {
    throw new Error(`unsupported ipc message: ${line.slice(0, 80)}`);
  }

  return parsed as AnyMessage;
}
