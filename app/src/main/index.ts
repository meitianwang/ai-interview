import { app, BrowserWindow } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";
import { IpcClient } from "./ipc/IpcClient";

let floatingWindow: BrowserWindow | null = null;
let sidecar: IpcClient | null = null;
const floatingEntry = "src/renderer/floating/index.html";

function loadFloatingWindow(window: BrowserWindow) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(new URL(floatingEntry, devServerUrl).toString());
    return;
  }

  window.loadFile(join(app.getAppPath(), "dist", floatingEntry));
}

function connectSidecar() {
  const socketPath = join(homedir(), "Library/Application Support/ai-interview/sidecar.sock");
  const client = new IpcClient(socketPath);

  client.on("connect", () => {
    setTimeout(() => {
      client.send({
        v: 1,
        t: "ping",
        seq: client.nextSeq(),
        ts: Date.now(),
        p: { token: "hello" },
      });
    }, 3000);
  });
  client.on("event", (event) => {
    floatingWindow?.webContents.send("sidecar-event", event);
  });
  client.on("error", (error) => {
    console.error("[sidecar]", error);
  });
  client.on("disconnect", () => {
    sidecar = null;
    setTimeout(connectSidecar, 1000);
  });

  sidecar = client;
  client.connect();
}

app.whenReady().then(() => {
  floatingWindow = new BrowserWindow({
    width: 480,
    height: 220,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, "preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadFloatingWindow(floatingWindow);
  setTimeout(connectSidecar, 200);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
