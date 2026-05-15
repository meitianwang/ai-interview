import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { SidecarEvent } from "@ai-interview/shared";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AutoReconnectASR } from "./asr/AutoReconnectASR";
import { AudioBuffer } from "./audio/AudioBuffer";
import { createASRClient, type ASRConfig } from "./asr/ASRFactory";
import { TranscriptStore } from "./asr/TranscriptStore";
import { QuestionClassifier } from "./classifier/QuestionClassifier";
import { ContextManager } from "./context/ContextManager";
import { IpcClient } from "./ipc/IpcClient";
import { ClaudeClient } from "./llm/ClaudeClient";
import type { LLMClient } from "./llm/LLMClient";
import { LLMRouter } from "./llm/LLMRouter";
import { MockLLMClient } from "./llm/MockLLMClient";
import { OpenAIClient } from "./llm/OpenAIClient";
import { Logger } from "./log/Logger";
import { PromptBuilder } from "./prompt/PromptBuilder";
import { SecretStore, type Settings } from "./secrets/SecretStore";
import { StealthCoordinator } from "./stealth/StealthCoordinator";
import { StatusStateMachine, type StatusLevel } from "./status/StatusStateMachine";
import { TriggerLogic } from "./trigger/TriggerLogic";
import { Triggerer } from "./trigger/Triggerer";
import { EnergyVADProcessor } from "./vad/VADProcessor";

let floatingWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sidecar: IpcClient | null = null;
let sidecarProc: ChildProcess | null = null;
let sidecarRestartTimer: NodeJS.Timeout | null = null;
let logger: Logger | null = null;
let isQuitting = false;
const floatingEntry = "src/renderer/floating/index.html";
const settingsEntry = "src/renderer/settings/index.html";
const audioBuffer = new AudioBuffer();
const transcriptStore = new TranscriptStore();
const contextManager = new ContextManager({ transcriptStore });
const promptBuilder = new PromptBuilder();
const classifier = new QuestionClassifier();
const stealth = new StealthCoordinator();
const appStatus = new StatusStateMachine();
const defaultSettings: Settings = {
  resume: "",
  jd: "",
  anthropicKey: "",
  openaiKey: "",
  huoshanAppId: "",
  huoshanToken: "",
};
let settingsCache: Settings = { ...defaultSettings };
const asrConfig: ASRConfig =
  process.env.ASR_PROVIDER === "huoshan"
    ? {
        provider: "huoshan",
        url: process.env.HUOSHAN_URL ?? "",
        appId: process.env.HUOSHAN_APPID ?? "",
        token: process.env.HUOSHAN_TOKEN ?? "",
        sampleRate: 16_000,
        language: "zh-CN",
      }
    : {
        provider: "mock",
        script: [
          { afterMs: 800, type: "partial", text: "你介绍一下" },
          { afterMs: 1500, type: "partial", text: "你介绍一下自己" },
          { afterMs: 2200, type: "final", text: "你介绍一下自己吧。" },
        ],
      };
const asr = new AutoReconnectASR(() => createASRClient(asrConfig), { delayMs: 1500, maxRetries: 5 });
const llmRouter = new LLMRouter(createLLMClients(settingsCache), { timeoutMs: 8000 });
const triggerer = new Triggerer(contextManager, promptBuilder, llmRouter);
const vad = new EnergyVADProcessor({ threshold: 0.02 });
const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fireAnswer });
let answerInFlight = false;
let triggerTickTimer: NodeJS.Timeout | null = null;

let secretStore: SecretStore | null = null;

function loadRendererWindow(window: BrowserWindow, entry: string) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(new URL(entry, devServerUrl).toString());
    return;
  }

  window.loadFile(join(app.getAppPath(), "dist", entry));
}

function loadFloatingWindow(window: BrowserWindow) {
  loadRendererWindow(window, floatingEntry);
}

function loadSettingsWindow(window: BrowserWindow) {
  loadRendererWindow(window, settingsEntry);
}

function sendToFloating(channel: string, payload: unknown) {
  if (!floatingWindow || floatingWindow.isDestroyed() || floatingWindow.webContents.isDestroyed()) {
    return;
  }

  floatingWindow.webContents.send(channel, payload);
}

function fireAnswer() {
  if (answerInFlight) {
    return;
  }

  answerInFlight = true;
  const context = contextManager.buildContext();
  const questionType = classifier.classify({ transcript: context.transcript, ocr: context.ocr });
  triggerer
    .fire(questionType)
    .catch((error) => console.error("[trigger]", error))
    .finally(() => {
      answerInFlight = false;
    });
}

function abortAnswer() {
  if (!answerInFlight) {
    return;
  }

  triggerer.abort();
  answerInFlight = false;
  sendToFloating("answer-done", null);
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const window = new BrowserWindow({
    width: 820,
    height: 720,
    minWidth: 620,
    minHeight: 560,
    title: "AI Interview 设置",
    webPreferences: {
      preload: join(__dirname, "preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow = window;
  loadSettingsWindow(window);
  window.on("closed", () => {
    if (settingsWindow === window) {
      settingsWindow = null;
    }
  });
}

function sanitizeSettings(payload: unknown): Settings {
  const source: Partial<Record<keyof Settings, unknown>> =
    payload && typeof payload === "object" ? (payload as Partial<Record<keyof Settings, unknown>>) : {};
  const readString = (key: keyof Settings) => {
    const value = source[key];
    return typeof value === "string" ? value : settingsCache[key];
  };

  return {
    resume: readString("resume"),
    jd: readString("jd"),
    anthropicKey: readString("anthropicKey"),
    openaiKey: readString("openaiKey"),
    huoshanAppId: readString("huoshanAppId"),
    huoshanToken: readString("huoshanToken"),
  };
}

function applySettingsToRuntime(settings: Settings) {
  contextManager.updateResume(settings.resume);
  contextManager.updateJD(settings.jd);
  llmRouter.updateClients(createLLMClients(settings));
}

function getSecretStore() {
  if (!secretStore) {
    secretStore = new SecretStore({ configPath: join(app.getPath("userData"), "settings.json") });
  }

  return secretStore;
}

async function loadStoredSettings() {
  try {
    const settings = await getSecretStore().loadAll();
    settingsCache = settings;
    applySettingsToRuntime(settings);
  } catch (error) {
    console.error("[settings]", error);
  }
}

function getLogger() {
  if (!logger) {
    logger = new Logger(join(app.getPath("userData"), "logs", "app.jsonl"));
  }

  return logger;
}

function logEvent(entry: Parameters<Logger["log"]>[0]) {
  if (!app.isReady()) {
    return;
  }

  try {
    getLogger().log(entry);
  } catch (error) {
    console.error("[logger]", error);
  }
}

function errorMeta(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  if (typeof error === "object" && error !== null) {
    return { error };
  }

  return { error: String(error) };
}

function settingsMeta(settings: Settings): Record<string, unknown> {
  return {
    anthropicConfigured: settings.anthropicKey.length > 0,
    huoshanAsrConfigured: settings.huoshanAppId.length > 0 && settings.huoshanToken.length > 0,
    openaiConfigured: settings.openaiKey.length > 0,
    profileConfigured: settings.resume.length > 0,
    targetRoleConfigured: settings.jd.length > 0,
  };
}

function assertSettingsSender(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? event.sender.getURL();
  if (!url.includes(settingsEntry)) {
    throw new Error(`settings IPC rejected from ${url}`);
  }
}

function reportStatus(event: string) {
  const changed = appStatus.report(event);
  if (changed) {
    logEvent({ level: "warn", module: "status", type: event, meta: { level: appStatus.level() } });
  }
  refreshTray();
}

function clearStatus(event: string) {
  const changed = appStatus.clear(event);
  if (changed) {
    logEvent({ level: "info", module: "status", type: `${event}.cleared`, meta: { level: appStatus.level() } });
  }
  refreshTray();
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(makeTrayIcon(appStatus.level()));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开设置", click: openSettings },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );
  tray.on("click", openSettings);
  refreshTray();
}

function refreshTray() {
  if (!tray) {
    return;
  }

  const level = appStatus.level();
  tray.setImage(makeTrayIcon(level));
  tray.setToolTip(`AI Interview · ${statusLabel(level)}`);
}

function makeTrayIcon(level: StatusLevel) {
  const [red, green, blue] = statusColor(level);
  const size = 16;
  const radius = 5.5;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      if (Math.sqrt(dx * dx + dy * dy) > radius) {
        continue;
      }

      const offset = (y * size + x) * 4;
      bitmap[offset] = blue;
      bitmap[offset + 1] = green;
      bitmap[offset + 2] = red;
      bitmap[offset + 3] = 255;
    }
  }

  const image = nativeImage.createFromBitmap(bitmap, { width: size, height: size });
  image.setTemplateImage(false);
  return image;
}

function statusColor(level: StatusLevel): [number, number, number] {
  switch (level) {
    case "green":
      return [109, 191, 109];
    case "yellow":
      return [230, 200, 74];
    case "orange":
      return [232, 146, 60];
    case "red":
      return [224, 70, 60];
  }
}

function statusLabel(level: StatusLevel): string {
  switch (level) {
    case "green":
      return "正常";
    case "yellow":
      return "降级";
    case "orange":
      return "异常";
    case "red":
      return "需要处理";
  }
}

function registerFocusedWindowShortcut(window: BrowserWindow) {
  window.webContents.on("before-input-event", (event, input) => {
    const isModifierShortcut = input.type === "keyDown" && input.shift && (input.control || input.meta);
    const isAnswerShortcut = isModifierShortcut && (input.code === "Space" || input.key === " ");
    const isAbortShortcut = isModifierShortcut && (input.code === "KeyX" || input.key.toLowerCase() === "x");

    if (!isAnswerShortcut && !isAbortShortcut) {
      return;
    }

    event.preventDefault();
    if (isAbortShortcut) {
      abortAnswer();
    } else {
      fireAnswer();
    }
  });
}

function startSidecarChild() {
  if (!shouldManageSidecarChild() || sidecarProc) {
    return;
  }

  const sidecarPath = join(process.resourcesPath, "sidecar");
  if (!existsSync(sidecarPath)) {
    reportStatus("ipc.disconnected");
    logEvent({ level: "error", module: "sidecar", type: "missing-binary", meta: { sidecarPath } });
    return;
  }

  const child = spawn(sidecarPath, [], { detached: false, stdio: "ignore" });
  sidecarProc = child;
  logEvent({ level: "info", module: "sidecar", type: "started", meta: { pid: child.pid } });
  child.once("error", (error) => {
    if (sidecarProc === child) {
      sidecarProc = null;
    }
    reportStatus("ipc.disconnected");
    logEvent({ level: "error", module: "sidecar", type: "spawn-error", meta: errorMeta(error) });
    scheduleSidecarRestart();
  });
  child.once("exit", (code, signal) => {
    if (sidecarProc === child) {
      sidecarProc = null;
    }
    logEvent({ level: "warn", module: "sidecar", type: "exited", meta: { code, signal } });
    scheduleSidecarRestart();
  });
}

function shouldManageSidecarChild(): boolean {
  return app.isPackaged && process.env.NODE_ENV !== "development" && !isQuitting;
}

function scheduleSidecarRestart() {
  if (!shouldManageSidecarChild() || sidecarRestartTimer) {
    return;
  }

  sidecarRestartTimer = setTimeout(() => {
    sidecarRestartTimer = null;
    startSidecarChild();
  }, 2000);
}

function stopSidecarChild() {
  if (sidecarRestartTimer) {
    clearTimeout(sidecarRestartTimer);
    sidecarRestartTimer = null;
  }
  sidecarProc?.kill();
  sidecarProc = null;
}

function connectSidecar() {
  const socketPath = join(homedir(), "Library/Application Support/ai-interview/sidecar.sock");
  const client = new IpcClient(socketPath);

  client.on("connect", () => {
    clearStatus("ipc.disconnected");
    logEvent({ level: "info", module: "ipc", type: "connected" });
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
  client.on("event", (event: SidecarEvent) => {
    if (event.t === "audio.chunk") {
      const pcm = Buffer.from(event.p.pcm_b64, "base64");
      audioBuffer.push(pcm);
      asr.pushAudio(pcm);
      triggerLogic.onVAD(vad.processBuffer(pcm), Date.now());
      sendToFloating("audio-level", audioBuffer.rmsLevel());
    }

    if (event.t === "screen-share.changed") {
      stealth.protectAll();
      sendToFloating("share-state", event.p.active);
    }

    if (event.t === "ocr.result") {
      contextManager.updateOCR(event.p.text);
      sendToFloating("ocr", event.p.text);
    }

    sendToFloating("sidecar-event", event);
  });
  client.on("error", (error) => {
    reportStatus("ipc.disconnected");
    logEvent({ level: "error", module: "ipc", type: "error", meta: errorMeta(error) });
    console.error("[sidecar]", error);
  });
  client.on("disconnect", () => {
    reportStatus("ipc.disconnected");
    logEvent({ level: "warn", module: "ipc", type: "disconnected" });
    sidecar = null;
    setTimeout(connectSidecar, 1000);
  });

  sidecar = client;
  client.connect();
}

asr.on("connected", () => {
  clearStatus("asr.reconnecting");
  clearStatus("asr.failed");
  logEvent({ level: "info", module: "asr", type: "connected" });
});
asr.on("reconnecting", (retry) => {
  reportStatus("asr.reconnecting");
  logEvent({ level: "warn", module: "asr", type: "reconnecting", meta: { retry } });
});
asr.on("failed", () => {
  reportStatus("asr.failed");
  logEvent({ level: "error", module: "asr", type: "failed" });
});
asr.on("error", (error) => {
  reportStatus("asr.failed");
  logEvent({ level: "error", module: "asr", type: "error", meta: errorMeta(error) });
  console.error("[asr]", error);
});
asr.on("transcript", (event) => {
  clearStatus("asr.failed");
  if (event.type === "partial") {
    transcriptStore.applyPartial(event.text, event.ts);
  } else {
    transcriptStore.applyFinal(event.text, event.ts);
  }
  triggerLogic.updateTranscriptTail(transcriptStore.tail(40));
  sendToFloating("transcript", transcriptStore.snapshot());
});
asr.connect().catch((error) => {
  reportStatus("asr.failed");
  console.error("[asr]", error);
});
llmRouter.on("fallback", (event) => {
  reportStatus("llm.fallback");
  logEvent({ level: "warn", module: "llm", type: "fallback", meta: event });
});
llmRouter.on("client-error", (event) => {
  reportStatus("llm.failed");
  logEvent({ level: "error", module: "llm", type: "client-error", meta: event as Record<string, unknown> });
});
triggerer.on("start", () => {
  clearStatus("llm.fallback");
  clearStatus("llm.failed");
  logEvent({ level: "info", module: "llm", type: "answer-start" });
  sendToFloating("answer-start", null);
});
triggerer.on("token", (text) => sendToFloating("answer-token", text));
triggerer.on("done", () => {
  clearStatus("llm.failed");
  logEvent({ level: "info", module: "llm", type: "answer-done" });
  sendToFloating("answer-done", null);
});
ipcMain.handle("settings:load", async (event) => {
  assertSettingsSender(event);
  settingsCache = await getSecretStore().loadAll();
  applySettingsToRuntime(settingsCache);
  logEvent({ level: "info", module: "settings", type: "load", meta: settingsMeta(settingsCache) });
  return { ...settingsCache };
});
ipcMain.handle("settings:save", async (event, payload: unknown) => {
  assertSettingsSender(event);
  const settings = sanitizeSettings(payload);
  settingsCache = await getSecretStore().saveAll(settings);
  applySettingsToRuntime(settingsCache);
  logEvent({ level: "info", module: "settings", type: "save", meta: settingsMeta(settingsCache) });
  return { ...settingsCache };
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.setActivationPolicy("accessory");
    app.dock?.hide();
  }
  void loadStoredSettings();
  createTray();
  startSidecarChild();

  const window = new BrowserWindow({
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
  floatingWindow = window;
  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true);

  stealth.protect(window);
  loadFloatingWindow(window);
  registerFocusedWindowShortcut(window);
  window.on("closed", () => {
    stealth.unprotect(window);
    if (floatingWindow === window) {
      floatingWindow = null;
    }
  });
  setTimeout(connectSidecar, app.isPackaged ? 500 : 200);
  triggerTickTimer = setInterval(() => triggerLogic.tick(Date.now()), 200);
  if (!globalShortcut.register("CommandOrControl+Shift+Space", fireAnswer)) {
    console.warn("[trigger] CommandOrControl+Shift+Space registration failed");
  }
  if (!globalShortcut.register("CommandOrControl+Shift+X", abortAnswer)) {
    console.warn("[trigger] CommandOrControl+Shift+X registration failed");
  }
  if (!globalShortcut.register("CommandOrControl+Shift+,", openSettings)) {
    console.warn("[settings] CommandOrControl+Shift+, registration failed");
  }
});

app.on("window-all-closed", () => {
  asr.disconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (triggerTickTimer) {
    clearInterval(triggerTickTimer);
    triggerTickTimer = null;
  }
  triggerer.abort();
  stopSidecarChild();
  tray?.destroy();
  tray = null;
  void logger?.close().catch((error) => console.error("[logger]", error));
  logger = null;
});

function createLLMClients(settings: Pick<Settings, "anthropicKey" | "openaiKey">): {
  primary: LLMClient;
  fallback: LLMClient;
} {
  const anthropicKey = settings.anthropicKey || process.env.ANTHROPIC_API_KEY;
  const openaiKey = settings.openaiKey || process.env.OPENAI_API_KEY;
  const openaiClient = openaiKey
    ? new OpenAIClient({
        apiKey: openaiKey,
        model: process.env.OPENAI_MODEL ?? "gpt-5.4",
      })
    : null;
  const claudeClient = anthropicKey
    ? new ClaudeClient({
        apiKey: anthropicKey,
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      })
    : null;

  if (claudeClient) {
    return {
      primary: claudeClient,
      fallback: openaiClient ?? new MockLLMClient("备用答案：请补充 OpenAI API key。"),
    };
  }

  if (openaiClient) {
    return {
      primary: openaiClient,
      fallback: new MockLLMClient("备用答案：请补充 Anthropic API key。"),
    };
  }

  return {
    primary: new MockLLMClient(),
    fallback: new MockLLMClient("备用答案：请先补充 API key。"),
  };
}
