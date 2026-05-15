import { app, BrowserWindow, globalShortcut } from "electron";
import type { SidecarEvent } from "@ai-interview/shared";
import { homedir } from "node:os";
import { join } from "node:path";
import { AudioBuffer } from "./audio/AudioBuffer";
import { createASRClient } from "./asr/ASRFactory";
import { TranscriptStore } from "./asr/TranscriptStore";
import { QuestionClassifier } from "./classifier/QuestionClassifier";
import { ContextManager } from "./context/ContextManager";
import { IpcClient } from "./ipc/IpcClient";
import { ClaudeClient } from "./llm/ClaudeClient";
import type { LLMClient } from "./llm/LLMClient";
import { LLMRouter } from "./llm/LLMRouter";
import { MockLLMClient } from "./llm/MockLLMClient";
import { OpenAIClient } from "./llm/OpenAIClient";
import { PromptBuilder } from "./prompt/PromptBuilder";
import { StealthCoordinator } from "./stealth/StealthCoordinator";
import { TriggerLogic } from "./trigger/TriggerLogic";
import { Triggerer } from "./trigger/Triggerer";
import { EnergyVADProcessor } from "./vad/VADProcessor";

let floatingWindow: BrowserWindow | null = null;
let sidecar: IpcClient | null = null;
const floatingEntry = "src/renderer/floating/index.html";
const audioBuffer = new AudioBuffer();
const transcriptStore = new TranscriptStore();
const contextManager = new ContextManager({ transcriptStore });
const promptBuilder = new PromptBuilder();
const classifier = new QuestionClassifier();
const stealth = new StealthCoordinator();
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
const llmRouter = new LLMRouter(createLLMClients(), { timeoutMs: 8000 });
const triggerer = new Triggerer(contextManager, promptBuilder, llmRouter);
const vad = new EnergyVADProcessor({ threshold: 0.02 });
const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fireAnswer });
let answerInFlight = false;
let triggerTickTimer: NodeJS.Timeout | null = null;

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
  triggerLogic.updateTranscriptTail(transcriptStore.tail(40));
  sendToFloating("transcript", transcriptStore.snapshot());
});
triggerer.on("start", () => sendToFloating("answer-start", null));
triggerer.on("token", (text) => sendToFloating("answer-token", text));
triggerer.on("done", () => sendToFloating("answer-done", null));

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.setActivationPolicy("accessory");
    app.dock?.hide();
  }

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

  stealth.protect(window);
  loadFloatingWindow(window);
  registerFocusedWindowShortcut(window);
  window.on("closed", () => {
    stealth.unprotect(window);
    if (floatingWindow === window) {
      floatingWindow = null;
    }
  });
  setTimeout(connectSidecar, 200);
  triggerTickTimer = setInterval(() => triggerLogic.tick(Date.now()), 200);
  if (!globalShortcut.register("CommandOrControl+Shift+Space", fireAnswer)) {
    console.warn("[trigger] CommandOrControl+Shift+Space registration failed");
  }
  if (!globalShortcut.register("CommandOrControl+Shift+X", abortAnswer)) {
    console.warn("[trigger] CommandOrControl+Shift+X registration failed");
  }
});

app.on("window-all-closed", () => {
  asr.disconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (triggerTickTimer) {
    clearInterval(triggerTickTimer);
    triggerTickTimer = null;
  }
  triggerer.abort();
});

function createLLMClients(): { primary: LLMClient; fallback: LLMClient } {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey || !openaiKey) {
    return {
      primary: new MockLLMClient(),
      fallback: new MockLLMClient("备用答案：请先补充 API key。"),
    };
  }

  return {
    primary: new ClaudeClient({
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    }),
    fallback: new OpenAIClient({
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL ?? "gpt-5.4",
    }),
  };
}
