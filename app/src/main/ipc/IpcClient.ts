import { EventEmitter } from "node:events";
import * as net from "node:net";
import { decodeMessage, encodeMessage, type ElectronCommand, type SidecarEvent } from "@ai-interview/shared";

export class IpcClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = "";
  private seq = 0;
  private readonly maxBufferedBytes = 64 * 1024;

  constructor(private readonly socketPath: string) {
    super();
  }

  connect(): void {
    const socket = new net.Socket();
    socket.on("connect", () => this.emit("connect"));
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("close", () => this.emit("disconnect"));
    socket.on("error", (error) => this.emit("error", error));
    socket.connect(this.socketPath);
    this.socket = socket;
  }

  disconnect(): void {
    this.socket?.end();
    this.socket = null;
    this.buffer = "";
  }

  send(command: ElectronCommand): void {
    if (!this.socket) {
      throw new Error("not connected");
    }

    this.socket.write(encodeMessage(command));
  }

  nextSeq(): number {
    const seq = this.seq;
    this.seq += 1;
    return seq;
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.buffer, "utf8") > this.maxBufferedBytes) {
      this.buffer = this.buffer.slice(-this.maxBufferedBytes);
    }

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.trim().length > 0) {
        this.emitMessage(line);
      }

      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private emitMessage(line: string): void {
    try {
      this.emit("event", decodeMessage(line) as SidecarEvent);
    } catch (error) {
      this.emit("error", error);
    }
  }
}
