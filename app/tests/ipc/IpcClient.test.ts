import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { IpcClient } from "../../src/main/ipc/IpcClient";

describe("IpcClient", () => {
  it("connects to a UDS server and receives ready event", async () => {
    const socketPath = path.join(os.tmpdir(), `ipc-test-${Date.now()}.sock`);
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    const server = net.createServer((connection) => {
      connection.write(`${JSON.stringify({ v: 1, t: "ready", seq: 0, ts: 0, p: { version: "test" } })}\n`);
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const client = new IpcClient(socketPath);
    const event = await new Promise<any>((resolve, reject) => {
      client.once("event", resolve);
      client.once("error", reject);
      client.connect();
    });

    expect(event.t).toBe("ready");
    expect(event.p.version).toBe("test");

    client.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(socketPath, { force: true });
  });
});
