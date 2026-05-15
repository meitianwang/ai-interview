import { app, BrowserWindow } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";
import { AudioBuffer } from "./audio/AudioBuffer";
import { createASRClient } from "./asr/ASRFactory";
import { TranscriptStore } from "./asr/TranscriptStore";
import { IpcClient } from "./ipc/IpcClient";

let floatingWindow: BrowserWindow | null = null;
let sidecar: IpcClient | null = null;
const floatingEntry = "src/renderer/floating/index.html";
const audioBuffer = new AudioBuffer();
const transcriptStore = new TranscriptStore();
const asr =
  process.env.ASR_PROVIDER === "huoshan"
    ? createASRClient({
        provider: "huoshan",
        url: process.env.HUOSHAN_URL ?? "",
        appId: process.env.HUOSHAN_APPID ?? "",
        token: process.env.HUOSHAN_TOKEN ?? "",
        sampleRate: 16_000,
        language: "zh-CN",
      })
    : createASRClient({
        provider: "mock",
        script: [
          { afterMs: 800, type: "partial", text: "你介绍一下" },
          { afterMs: 1500, type: "partial", text: "你介绍一下自己" },
          { afterMs: 2200, type: "final", text: "你介绍一下自己吧。" },
        ],
      });

function loadFloatingWindow(window: BrowserWindow) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(new URL(floatingEntry, devServerUrl).toString());
    return;
  }

  window.loadFile(join(app.getAppPath(), "dist", floatingEntry));
}

function sendToFloating(channel: string, payload: unknown) {
  if (!floatingWindow || floatingWindow.isDestroyed() || floatingWindow.webContents.isDestroyed()) {
    return;
  }

  floatingWindow.webContents.send(channel, payload);
}

function connectSidecar() {
  const socketPath = join(homedir(), "Library/Application Support/ai-interview/sidecar.sock");
  const client = new IpcClient(socketPath);

  client.on("connect", () => {
    client.send({
      v: 1,
      t: "capture.start",
      seq: client.nextSeq(),
      ts: Date.now(),
      p: {},
    });

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
    if (event.t === "audio.chunk") {
      const pcm = Buffer.from(event.p.pcm_b64, "base64");
      audioBuffer.push(pcm);
      asr.pushAudio(pcm);
      sendToFloating("audio-level", audioBuffer.rmsLevel());
    }

    sendToFloating("sidecar-event", event);
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

void asr.connect();
asr.on("transcript", (event) => {
  if (event.type === "partial") {
    transcriptStore.applyPartial(event.text, event.ts);
  } else {
    transcriptStore.applyFinal(event.text, event.ts);
  }
  sendToFloating("transcript", transcriptStore.snapshot());
});

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
  floatingWindow.on("closed", () => {
    floatingWindow = null;
  });
  setTimeout(connectSidecar, 200);
});

app.on("window-all-closed", () => {
  asr.disconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
