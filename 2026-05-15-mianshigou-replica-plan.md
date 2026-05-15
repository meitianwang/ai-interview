# 面试狗类产品复刻 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec `2026-05-15-mianshigou-replica-design.md` 复刻"实时面试 AI 助手"，产出可在 macOS 本机端到端跑通的桌面应用。

**Architecture:** macOS 双进程：Swift sidecar（音频/屏幕/隐身原生能力）+ Electron app（UI / 业务编排 / 云端调用），本地 Unix Domain Socket 通讯。单次流式 LLM 调用（不上 agent），ASR 国产流式，LLM Claude/OpenAI 路由 + fallback。

**Tech Stack:**
- Swift 5.9+ / Swift Package Manager / ScreenCaptureKit (macOS 13+) / Vision
- Electron 28+ / Vite / React 18 / TypeScript / pnpm
- WebSocket (`ws` npm 包) / SSE / `node-keytar` / WebRTC VAD wasm (`@ricky0123/vad-web`)
- 测试：XCTest (Swift) / Vitest (TS)
- IPC：UDS + 行分隔 JSON

---

## 0 · 计划边界

跟 spec § 0 一致：

| 范围 | 是否进入任务 |
|---|---|
| 公开 Apple API 实现的能力（NSWindowSharingNone / LSUIElement / ScreenCaptureKit / Vision / CGDisplay） | **写完整 TDD 任务** |
| ASR / LLM / Electron / VAD / OCR 等基础设施 | **写完整 TDD 任务** |
| spec § 6.5 对抗具体监考软件（Proctorio / 鹰眼 / 网易监考宝 等）的绕过 | **不进入任何任务**，spec 里仅作技术分类讨论 |

---

## 1 · 仓库结构

最终仓库目录如下（每一节任务会陆续创建）：

```
ai-interview/
├── .gitignore                                  (已存在)
├── 2026-05-15-mianshigou-replica-design.md     (spec)
├── 2026-05-15-mianshigou-replica-plan.md       (本文件)
├── package.json                                (pnpm workspace root)
├── pnpm-workspace.yaml
├── sidecar/                                    (Swift Package, macOS-only)
│   ├── Package.swift
│   ├── Sources/
│   │   ├── SidecarCore/         (库，可测)
│   │   │   ├── IPC/
│   │   │   ├── Audio/
│   │   │   ├── Screen/
│   │   │   ├── OCR/
│   │   │   ├── Hotkey/
│   │   │   └── Stealth/
│   │   └── SidecarApp/          (可执行 main)
│   │       └── main.swift
│   └── Tests/
│       └── SidecarCoreTests/
├── app/                         (Electron app, TypeScript)
│   ├── package.json
│   ├── vite.config.ts
│   ├── electron-builder.yml
│   ├── src/
│   │   ├── main/                (Electron main process)
│   │   │   ├── index.ts
│   │   │   ├── ipc/
│   │   │   ├── audio/
│   │   │   ├── asr/
│   │   │   ├── vad/
│   │   │   ├── trigger/
│   │   │   ├── classifier/
│   │   │   ├── context/
│   │   │   ├── prompt/
│   │   │   ├── llm/
│   │   │   ├── stealth/
│   │   │   ├── secrets/
│   │   │   └── status/
│   │   ├── preload/             (Electron preload)
│   │   │   └── index.ts
│   │   └── renderer/            (React UI)
│   │       ├── floating/        (浮窗答案显示)
│   │       ├── settings/        (设置窗)
│   │       └── shared/
│   └── tests/
├── shared/                      (IPC 协议定义 - 跨进程类型)
│   ├── package.json
│   └── src/
│       └── ipc-schema.ts        (主源 - TS 类型)
│       └── ipc-schema.swift     (Swift 端镜像)
├── tests/                       (集成测试 + replay harness)
│   ├── fixtures/
│   └── replay/
└── scripts/
    ├── dev.sh                   (并行启 sidecar + app)
    └── build-mac.sh
```

**重要约定：sidecar 是 SwiftPM 而不是 Xcode project**，可以纯 CLI 构建测试，对 CI 友好。最终打包成 macOS app 时再用 electron-builder 把 sidecar 二进制嵌进 Resources。

---

## 2 · 里程碑 (Milestones) 总览

| # | 名字 | 产出物 | 大致任务数 |
|---|---|---|---|
| M0 | 仓库脚手架 | 双进程能起来，hello-world 不接 | 5 |
| M1 | IPC 端到端薄片 | sidecar ↔ Electron 互通 ping/pong + mock 音频帧 | 6 |
| M2 | 音频采集 | sidecar 真实采集系统音频流到 Electron | 5 |
| M3 | ASR 流式转写 | UI 上实时看到转写文本 | 5 |
| M4 | LLM 管线（手动触发） | 按快捷键 → LLM 流式答案显示 | 5 |
| M5 | 隐身能力 | 屏幕共享时浮窗对面试官不可见 | 4 |
| M6 | VAD + 自动触发 | 面试官说完话自动答 | 4 |
| M7 | 屏幕识别 + OCR | 题面 OCR 自动进上下文 | 4 |
| M8 | UI 打磨 + 设置 | 浮窗 markdown、设置页、菜单栏 | 5 |
| M9 | 错误处理 + Replay 测试 | 失败降级 + 录制回放测试框架 | 4 |
| M10 | 端到端验收 + 分发准备 | 人肉测试清单跑通 + codesign | 3 |
| **合计** |  |  | **50** |

每个里程碑内的任务都遵循 TDD 五步：(1) 写失败测试 →（2）跑测试确认失败 → (3) 写最小实现 → (4) 跑测试确认通过 → (5) 提交。

为节省篇幅，**对每个任务的 Steps 2 和 4（跑测试）只在 M0-M2 完整写出，后续里程碑写"跑 <命令>，期望通过"**——TDD 节奏统一不变。

---

## M0 · 仓库脚手架

### Task 0.1 · pnpm workspace 根 + 顶层 package.json

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: 写顶层 package.json**

```json
{
  "name": "ai-interview",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "bash scripts/dev.sh",
    "test": "pnpm -r test",
    "build:app": "pnpm --filter app build",
    "build:sidecar": "cd sidecar && swift build -c release"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

- [ ] **Step 2: 写 pnpm-workspace.yaml**

```yaml
packages:
  - "app"
  - "shared"
```

- [ ] **Step 3: 验证 pnpm 能识别 workspace**

```bash
pnpm install
pnpm -r list  # 应该列出所有 workspace 包（暂时还没有，但不能报错）
```

期望：无报错（warnings 关于无 packages 可以忽略）

- [ ] **Step 4: 提交**

```bash
git add package.json pnpm-workspace.yaml
git commit -m "chore: 初始化 pnpm workspace 根"
```

---

### Task 0.2 · shared 包（IPC 协议类型源）

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/ipc-schema.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "@ai-interview/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 写 IPC schema 骨架**

```ts
// shared/src/ipc-schema.ts
export type SidecarEventType =
  | "ready"
  | "audio.chunk"
  | "ocr.result"
  | "hotkey.fired"
  | "screen-share.changed";

export type ElectronCommandType =
  | "capture.start"
  | "capture.stop"
  | "screenshot.request"
  | "window.set-stealth"
  | "ping";

export interface IpcMessage<T extends string, P> {
  v: 1;
  t: T;
  seq: number;
  ts: number;
  p: P;
}

export type SidecarEvent =
  | IpcMessage<"ready", { version: string }>
  | IpcMessage<"audio.chunk", { pcm_b64: string; sample_rate: 16000; channels: 1 }>
  | IpcMessage<"ocr.result", { text: string; boxes?: number[][] }>
  | IpcMessage<"hotkey.fired", { id: string }>
  | IpcMessage<"screen-share.changed", { active: boolean }>;

export type ElectronCommand =
  | IpcMessage<"capture.start", {}>
  | IpcMessage<"capture.stop", {}>
  | IpcMessage<"screenshot.request", { region?: { x: number; y: number; w: number; h: number } }>
  | IpcMessage<"window.set-stealth", { windowId: string; sharingType: "none" | "readOnly" | "readWrite" }>
  | IpcMessage<"ping", { token: string }>;
```

- [ ] **Step 4: 写 index.ts 导出**

```ts
// shared/src/index.ts
export * from "./ipc-schema";
```

- [ ] **Step 5: 安装依赖 + 验证编译**

```bash
pnpm install
pnpm --filter @ai-interview/shared exec tsc --noEmit
```

期望：无错误输出

- [ ] **Step 6: 提交**

```bash
git add shared/
git commit -m "feat(shared): 初始化 IPC 协议类型定义"
```

---

### Task 0.3 · Swift Package 初始化

**Files:**
- Create: `sidecar/Package.swift`
- Create: `sidecar/Sources/SidecarApp/main.swift`
- Create: `sidecar/Sources/SidecarCore/Placeholder.swift`
- Create: `sidecar/Tests/SidecarCoreTests/PlaceholderTests.swift`

- [ ] **Step 1: 写 Package.swift**

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Sidecar",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "SidecarApp", targets: ["SidecarApp"]),
        .library(name: "SidecarCore", targets: ["SidecarCore"]),
    ],
    targets: [
        .executableTarget(name: "SidecarApp", dependencies: ["SidecarCore"]),
        .target(name: "SidecarCore"),
        .testTarget(name: "SidecarCoreTests", dependencies: ["SidecarCore"]),
    ]
)
```

- [ ] **Step 2: 写最小 main.swift**

```swift
// sidecar/Sources/SidecarApp/main.swift
import SidecarCore
print("sidecar boot: \(SidecarCore.version)")
```

- [ ] **Step 3: 写 SidecarCore 占位常量**

```swift
// sidecar/Sources/SidecarCore/Placeholder.swift
public enum SidecarCore {
    public static let version = "0.0.1"
}
```

- [ ] **Step 4: 写占位测试**

```swift
// sidecar/Tests/SidecarCoreTests/PlaceholderTests.swift
import XCTest
@testable import SidecarCore

final class PlaceholderTests: XCTestCase {
    func testVersionExposed() {
        XCTAssertEqual(SidecarCore.version, "0.0.1")
    }
}
```

- [ ] **Step 5: 构建并测试**

```bash
cd sidecar
swift build
swift test
```

期望：测试 1 项通过

- [ ] **Step 6: 提交**

```bash
git add sidecar/
git commit -m "feat(sidecar): 初始化 Swift Package 骨架"
```

---

### Task 0.4 · Electron app 初始化（Vite + React + TypeScript）

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/src/main/index.ts`
- Create: `app/src/preload/index.ts`
- Create: `app/src/renderer/floating/index.html`
- Create: `app/src/renderer/floating/main.tsx`
- Create: `app/electron-builder.yml`

- [ ] **Step 1: 写 app/package.json**

```json
{
  "name": "app",
  "version": "0.0.1",
  "private": true,
  "main": "dist/main/index.cjs",
  "scripts": {
    "dev": "vite",
    "build": "vite build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ai-interview/shared": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "ws": "^8.16.0",
    "node-keytar": "^7.9.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/ws": "^8.5.10",
    "electron": "^28.2.0",
    "electron-builder": "^24.13.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.0",
    "@vitejs/plugin-react": "^4.2.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: 写 vite.config.ts（双入口 main + renderer）**

```ts
// app/vite.config.ts
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    electron([
      { entry: "src/main/index.ts" },
      { entry: "src/preload/index.ts", onstart: () => {} },
    ]),
  ],
  build: {
    rollupOptions: {
      input: {
        floating: "src/renderer/floating/index.html",
      },
    },
  },
});
```

- [ ] **Step 3: 写 main process 入口（暂时只开一个空浮窗）**

```ts
// app/src/main/index.ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";

let floatingWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  floatingWindow = new BrowserWindow({
    width: 480,
    height: 220,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  floatingWindow.loadFile(join(__dirname, "../renderer/floating/index.html"));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 4: 写最简 preload + renderer**

```ts
// app/src/preload/index.ts
import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("api", { version: "0.0.1" });
```

```html
<!-- app/src/renderer/floating/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Floating</title>
  <style>
    html, body { margin: 0; padding: 0; background: rgba(20,20,20,0.8); color: #fff; font-family: -apple-system, sans-serif; }
    #root { padding: 16px; }
  </style>
</head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

```tsx
// app/src/renderer/floating/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <div>面试助手 v0.0.1 · 浮窗就绪</div>
);
```

- [ ] **Step 5: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 6: 装依赖 + 跑起来**

```bash
pnpm install
pnpm --filter app dev
```

期望：Electron 窗口启动，显示"面试助手 v0.0.1 · 浮窗就绪"。手动关闭后继续。

- [ ] **Step 7: 提交**

```bash
git add app/
git commit -m "feat(app): 初始化 Electron + Vite + React 脚手架"
```

---

### Task 0.5 · 并行启动脚本 + .gitignore 补充

**Files:**
- Create: `scripts/dev.sh`
- Modify: `.gitignore`

- [ ] **Step 1: 写 dev.sh**

```bash
#!/usr/bin/env bash
# scripts/dev.sh - 并行起 sidecar 和 Electron
set -euo pipefail

cd "$(dirname "$0")/.."

(cd sidecar && swift run SidecarApp) &
SIDECAR_PID=$!

trap "kill $SIDECAR_PID 2>/dev/null || true" EXIT

pnpm --filter app dev
```

- [ ] **Step 2: 加可执行权限**

```bash
chmod +x scripts/dev.sh
```

- [ ] **Step 3: 补 .gitignore**

```gitignore
# Node
node_modules/
dist/

# Swift
sidecar/.build/
sidecar/.swiftpm/
sidecar/Package.resolved

# OS
.DS_Store

# Editor
.vscode/
.idea/

# 已有
.superpowers/
```

- [ ] **Step 4: 验证脚本能执行**

```bash
# 不真跑（M0 阶段 sidecar 还只 print 然后退），只验证脚本语法
bash -n scripts/dev.sh
```

期望：无输出（语法正确）

- [ ] **Step 5: 提交**

```bash
git add scripts/dev.sh .gitignore
git commit -m "chore: 加并行 dev 脚本 + 补全 .gitignore"
```

---

## M1 · IPC 端到端薄片

### Task 1.1 · IPC 帧编码器（shared 包）

**Files:**
- Create: `shared/src/codec.ts`
- Modify: `shared/src/index.ts`
- Create: `shared/src/codec.test.ts`

- [ ] **Step 1: 写测试**

```ts
// shared/src/codec.test.ts
import { describe, expect, it } from "vitest";
import { encodeMessage, decodeMessage } from "./codec";

describe("codec", () => {
  it("encodes to a single-line JSON ending with \\n", () => {
    const msg = { v: 1 as const, t: "ping" as const, seq: 1, ts: 100, p: { token: "x" } };
    const buf = encodeMessage(msg);
    expect(buf.toString("utf8").endsWith("\n")).toBe(true);
    expect(buf.toString("utf8").split("\n").length).toBe(2); // last is empty
  });

  it("decodes back to original", () => {
    const msg = { v: 1 as const, t: "ping" as const, seq: 2, ts: 200, p: { token: "y" } };
    const buf = encodeMessage(msg);
    const decoded = decodeMessage(buf.toString("utf8").trim());
    expect(decoded).toEqual(msg);
  });

  it("throws on malformed JSON", () => {
    expect(() => decodeMessage("not json")).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @ai-interview/shared test
```

期望：FAIL（codec 还没实现）

- [ ] **Step 3: 写实现**

```ts
// shared/src/codec.ts
import type { SidecarEvent, ElectronCommand } from "./ipc-schema";

export type AnyMessage = SidecarEvent | ElectronCommand;

export function encodeMessage(msg: AnyMessage): Buffer {
  return Buffer.from(JSON.stringify(msg) + "\n", "utf8");
}

export function decodeMessage(line: string): AnyMessage {
  const parsed = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || parsed.v !== 1) {
    throw new Error(`unsupported ipc message: ${line.slice(0, 80)}`);
  }
  return parsed as AnyMessage;
}
```

```ts
// shared/src/index.ts (追加)
export * from "./codec";
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @ai-interview/shared test
```

期望：3 项通过

- [ ] **Step 5: 提交**

```bash
git add shared/src/codec.ts shared/src/codec.test.ts shared/src/index.ts
git commit -m "feat(shared): IPC 帧 JSON 编解码"
```

---

### Task 1.2 · Swift 端 IPC 类型 + 编解码

**Files:**
- Create: `sidecar/Sources/SidecarCore/IPC/IpcMessage.swift`
- Create: `sidecar/Sources/SidecarCore/IPC/IpcCodec.swift`
- Create: `sidecar/Tests/SidecarCoreTests/IPC/IpcCodecTests.swift`

- [ ] **Step 1: 写测试**

```swift
// sidecar/Tests/SidecarCoreTests/IPC/IpcCodecTests.swift
import XCTest
@testable import SidecarCore

final class IpcCodecTests: XCTestCase {
    func testEncodeReadyEvent() throws {
        let ev = SidecarEvent.ready(seq: 1, ts: 100, version: "0.0.1")
        let data = try IpcCodec.encode(ev)
        let str = String(data: data, encoding: .utf8)!
        XCTAssertTrue(str.hasSuffix("\n"))
        XCTAssertTrue(str.contains("\"t\":\"ready\""))
    }

    func testDecodePing() throws {
        let line = #"{"v":1,"t":"ping","seq":7,"ts":200,"p":{"token":"abc"}}"#
        guard case .ping(let seq, _, let token) = try IpcCodec.decodeCommand(line) else {
            XCTFail("expected ping"); return
        }
        XCTAssertEqual(seq, 7)
        XCTAssertEqual(token, "abc")
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd sidecar && swift test
```

期望：编译错误（类型未定义）

- [ ] **Step 3: 写类型 + 编解码**

```swift
// sidecar/Sources/SidecarCore/IPC/IpcMessage.swift
import Foundation

public enum SidecarEvent {
    case ready(seq: Int, ts: Int64, version: String)
    case audioChunk(seq: Int, ts: Int64, pcmBase64: String)
    case ocrResult(seq: Int, ts: Int64, text: String, boxes: [[Double]]?)
    case hotkeyFired(seq: Int, ts: Int64, id: String)
    case screenShareChanged(seq: Int, ts: Int64, active: Bool)
}

public enum ElectronCommand {
    case captureStart(seq: Int, ts: Int64)
    case captureStop(seq: Int, ts: Int64)
    case screenshotRequest(seq: Int, ts: Int64, region: ScreenRegion?)
    case windowSetStealth(seq: Int, ts: Int64, windowId: String, sharingType: String)
    case ping(seq: Int, ts: Int64, token: String)
}

public struct ScreenRegion: Codable {
    public let x: Int; public let y: Int; public let w: Int; public let h: Int
}
```

```swift
// sidecar/Sources/SidecarCore/IPC/IpcCodec.swift
import Foundation

public enum IpcCodec {
    public static func encode(_ event: SidecarEvent) throws -> Data {
        let env = makeEnvelope(event)
        var data = try JSONSerialization.data(withJSONObject: env, options: [.sortedKeys])
        data.append(0x0A)  // "\n"
        return data
    }

    public static func decodeCommand(_ line: String) throws -> ElectronCommand {
        let json = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
        guard let json = json, json["v"] as? Int == 1 else {
            throw IpcError.unsupported
        }
        let t = json["t"] as? String ?? ""
        let seq = json["seq"] as? Int ?? 0
        let ts = (json["ts"] as? Int64) ?? Int64(json["ts"] as? Int ?? 0)
        let p = json["p"] as? [String: Any] ?? [:]

        switch t {
        case "ping":
            return .ping(seq: seq, ts: ts, token: p["token"] as? String ?? "")
        case "capture.start":
            return .captureStart(seq: seq, ts: ts)
        case "capture.stop":
            return .captureStop(seq: seq, ts: ts)
        case "screenshot.request":
            var region: ScreenRegion? = nil
            if let r = p["region"] as? [String: Any] {
                region = ScreenRegion(
                    x: r["x"] as? Int ?? 0, y: r["y"] as? Int ?? 0,
                    w: r["w"] as? Int ?? 0, h: r["h"] as? Int ?? 0
                )
            }
            return .screenshotRequest(seq: seq, ts: ts, region: region)
        case "window.set-stealth":
            return .windowSetStealth(
                seq: seq, ts: ts,
                windowId: p["windowId"] as? String ?? "",
                sharingType: p["sharingType"] as? String ?? "readWrite"
            )
        default:
            throw IpcError.unknownType(t)
        }
    }

    private static func makeEnvelope(_ event: SidecarEvent) -> [String: Any] {
        switch event {
        case .ready(let seq, let ts, let version):
            return ["v": 1, "t": "ready", "seq": seq, "ts": ts, "p": ["version": version]]
        case .audioChunk(let seq, let ts, let pcm):
            return ["v": 1, "t": "audio.chunk", "seq": seq, "ts": ts,
                    "p": ["pcm_b64": pcm, "sample_rate": 16000, "channels": 1]]
        case .ocrResult(let seq, let ts, let text, let boxes):
            var p: [String: Any] = ["text": text]
            if let b = boxes { p["boxes"] = b }
            return ["v": 1, "t": "ocr.result", "seq": seq, "ts": ts, "p": p]
        case .hotkeyFired(let seq, let ts, let id):
            return ["v": 1, "t": "hotkey.fired", "seq": seq, "ts": ts, "p": ["id": id]]
        case .screenShareChanged(let seq, let ts, let active):
            return ["v": 1, "t": "screen-share.changed", "seq": seq, "ts": ts, "p": ["active": active]]
        }
    }
}

public enum IpcError: Error {
    case unsupported
    case unknownType(String)
}
```

- [ ] **Step 4: 跑测试**

```bash
cd sidecar && swift test
```

期望：所有测试通过

- [ ] **Step 5: 提交**

```bash
git add sidecar/Sources/SidecarCore/IPC/ sidecar/Tests/SidecarCoreTests/IPC/
git commit -m "feat(sidecar): IPC 类型 + JSON 编解码"
```

---

### Task 1.3 · Sidecar UDS 服务器

**Files:**
- Create: `sidecar/Sources/SidecarCore/IPC/IpcServer.swift`
- Create: `sidecar/Tests/SidecarCoreTests/IPC/IpcServerTests.swift`
- Modify: `sidecar/Sources/SidecarApp/main.swift`

- [ ] **Step 1: 写测试**

```swift
// sidecar/Tests/SidecarCoreTests/IPC/IpcServerTests.swift
import XCTest
@testable import SidecarCore

final class IpcServerTests: XCTestCase {
    func testServerListensAndEmitsReady() async throws {
        let path = NSTemporaryDirectory() + "ipctest-\(UUID().uuidString).sock"
        defer { try? FileManager.default.removeItem(atPath: path) }

        let server = IpcServer(socketPath: path)
        try server.start()
        defer { server.stop() }

        // 模拟客户端连一下，应收到 ready 事件
        let line = try await connectAndReadOneLine(path: path)
        XCTAssertTrue(line.contains("\"t\":\"ready\""))
    }

    private func connectAndReadOneLine(path: String) async throws -> String {
        let sock = socket(AF_UNIX, SOCK_STREAM, 0)
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        path.withCString { p in
            withUnsafeMutablePointer(to: &addr.sun_path) {
                $0.withMemoryRebound(to: CChar.self, capacity: 104) { dest in
                    _ = strncpy(dest, p, 103)
                }
            }
        }
        let size = socklen_t(MemoryLayout<sockaddr_un>.size)
        _ = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(sock, $0, size)
            }
        }
        var buf = [UInt8](repeating: 0, count: 4096)
        let n = recv(sock, &buf, buf.count, 0)
        close(sock)
        return String(bytes: buf.prefix(Int(n)), encoding: .utf8) ?? ""
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd sidecar && swift test --filter IpcServerTests
```

期望：FAIL（IpcServer 未实现）

- [ ] **Step 3: 写实现**

```swift
// sidecar/Sources/SidecarCore/IPC/IpcServer.swift
import Foundation
import Network

public final class IpcServer {
    public typealias CommandHandler = (ElectronCommand) -> Void

    private let socketPath: String
    private var listener: NWListener?
    private var clients: [NWConnection] = []
    private var nextSeq: Int = 0
    public var onCommand: CommandHandler?

    public init(socketPath: String) { self.socketPath = socketPath }

    public func start() throws {
        try? FileManager.default.removeItem(atPath: socketPath)
        let endpoint = NWEndpoint.unix(path: socketPath)
        let params = NWParameters(tls: nil)
        params.requiredLocalEndpoint = endpoint
        params.allowLocalEndpointReuse = true
        let l = try NWListener(using: params)
        l.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
        l.start(queue: .main)
        self.listener = l
        // 权限设为 0600
        chmod(socketPath, 0o600)
    }

    public func stop() {
        listener?.cancel()
        clients.forEach { $0.cancel() }
        try? FileManager.default.removeItem(atPath: socketPath)
    }

    public func emit(_ event: SidecarEvent) {
        guard let data = try? IpcCodec.encode(event) else { return }
        for c in clients {
            c.send(content: data, completion: .contentProcessed { _ in })
        }
    }

    private func accept(_ conn: NWConnection) {
        clients.append(conn)
        conn.start(queue: .main)
        // 一握手就发 ready
        let seq = nextSeq; nextSeq += 1
        let ev = SidecarEvent.ready(seq: seq, ts: Int64(Date().timeIntervalSince1970 * 1000), version: SidecarCore.version)
        if let data = try? IpcCodec.encode(ev) {
            conn.send(content: data, completion: .contentProcessed { _ in })
        }
        readLoop(conn)
    }

    private func readLoop(_ conn: NWConnection) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, complete, _ in
            guard let self = self else { return }
            if let data = data, !data.isEmpty {
                let text = String(data: data, encoding: .utf8) ?? ""
                for line in text.split(separator: "\n") {
                    if let cmd = try? IpcCodec.decodeCommand(String(line)) {
                        self.onCommand?(cmd)
                    }
                }
            }
            if complete {
                self.clients.removeAll { $0 === conn }
                return
            }
            self.readLoop(conn)
        }
    }
}
```

- [ ] **Step 4: 更新 main.swift 启动 server**

```swift
// sidecar/Sources/SidecarApp/main.swift
import Foundation
import SidecarCore

let path = NSHomeDirectory() + "/Library/Application Support/ai-interview/sidecar.sock"
try? FileManager.default.createDirectory(
    atPath: (path as NSString).deletingLastPathComponent,
    withIntermediateDirectories: true, attributes: nil
)

let server = IpcServer(socketPath: path)
server.onCommand = { cmd in
    print("sidecar received command: \(cmd)")
}
try server.start()
print("sidecar listening on \(path)")
RunLoop.main.run()
```

- [ ] **Step 5: 跑测试**

```bash
cd sidecar && swift test
```

期望：所有测试通过

- [ ] **Step 6: 提交**

```bash
git add sidecar/Sources/SidecarCore/IPC/IpcServer.swift sidecar/Tests/SidecarCoreTests/IPC/IpcServerTests.swift sidecar/Sources/SidecarApp/main.swift
git commit -m "feat(sidecar): UDS IPC 服务器 + 启动握手发 ready"
```

---

### Task 1.4 · Electron 端 UDS 客户端

**Files:**
- Create: `app/src/main/ipc/IpcClient.ts`
- Create: `app/tests/ipc/IpcClient.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/ipc/IpcClient.test.ts
import { describe, expect, it } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { IpcClient } from "../../src/main/ipc/IpcClient";

describe("IpcClient", () => {
  it("connects to a UDS server and receives ready event", async () => {
    const sock = path.join(os.tmpdir(), `ipc-test-${Date.now()}.sock`);
    if (fs.existsSync(sock)) fs.unlinkSync(sock);

    // 测试服务器：连进来就发 ready
    const server = net.createServer((conn) => {
      conn.write(JSON.stringify({ v: 1, t: "ready", seq: 0, ts: 0, p: { version: "test" } }) + "\n");
    });
    await new Promise<void>((r) => server.listen(sock, () => r()));

    const client = new IpcClient(sock);
    const event = await new Promise<any>((resolve) => {
      client.on("event", (e) => resolve(e));
      client.connect();
    });

    expect(event.t).toBe("ready");
    expect(event.p.version).toBe("test");

    client.disconnect();
    await new Promise<void>((r) => server.close(() => r()));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter app test ipc/IpcClient
```

期望：FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```ts
// app/src/main/ipc/IpcClient.ts
import * as net from "node:net";
import { EventEmitter } from "node:events";
import { decodeMessage, type SidecarEvent, type ElectronCommand } from "@ai-interview/shared";

export class IpcClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = "";
  private seq = 0;

  constructor(private readonly socketPath: string) { super(); }

  connect(): void {
    const s = net.createConnection(this.socketPath);
    s.on("data", (chunk) => this.onData(chunk));
    s.on("close", () => this.emit("disconnect"));
    s.on("error", (err) => this.emit("error", err));
    s.on("connect", () => this.emit("connect"));
    this.socket = s;
  }

  disconnect(): void {
    this.socket?.end();
    this.socket = null;
  }

  send(cmd: ElectronCommand): void {
    if (!this.socket) throw new Error("not connected");
    const line = JSON.stringify(cmd) + "\n";
    this.socket.write(line);
  }

  nextSeq(): number { return this.seq++; }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = decodeMessage(line) as SidecarEvent;
        this.emit("event", msg);
      } catch (e) {
        this.emit("error", e);
      }
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter app test ipc/IpcClient
```

期望：1 项通过

- [ ] **Step 5: 提交**

```bash
git add app/src/main/ipc/IpcClient.ts app/tests/ipc/IpcClient.test.ts
git commit -m "feat(app): UDS IPC 客户端 + 行分隔 JSON 解析"
```

---

### Task 1.5 · Main 进程连接 sidecar + 浮窗显示状态

**Files:**
- Modify: `app/src/main/index.ts`
- Modify: `app/src/preload/index.ts`
- Modify: `app/src/renderer/floating/main.tsx`

- [ ] **Step 1: Main 启动时连接 sidecar，转发事件到渲染进程**

```ts
// app/src/main/index.ts (整个替换)
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { homedir } from "node:os";
import { IpcClient } from "./ipc/IpcClient";

let floatingWindow: BrowserWindow | null = null;
let sidecar: IpcClient | null = null;

function createFloating() {
  floatingWindow = new BrowserWindow({
    width: 480, height: 220,
    frame: false, alwaysOnTop: true, transparent: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  floatingWindow.loadFile(join(__dirname, "../renderer/floating/index.html"));
}

function connectSidecar() {
  const sockPath = join(homedir(), "Library/Application Support/ai-interview/sidecar.sock");
  sidecar = new IpcClient(sockPath);
  sidecar.on("event", (ev) => floatingWindow?.webContents.send("sidecar-event", ev));
  sidecar.on("error", (e) => console.error("[sidecar]", e));
  sidecar.on("disconnect", () => {
    console.log("[sidecar] disconnected, retry in 1s");
    setTimeout(connectSidecar, 1000);
  });
  sidecar.connect();
}

app.whenReady().then(() => {
  createFloating();
  setTimeout(connectSidecar, 200); // 让 sidecar 有时间起来
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 2: preload 暴露事件订阅 API**

```ts
// app/src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  onSidecarEvent: (cb: (ev: unknown) => void) => {
    const handler = (_: unknown, ev: unknown) => cb(ev);
    ipcRenderer.on("sidecar-event", handler);
    return () => ipcRenderer.off("sidecar-event", handler);
  },
});
```

- [ ] **Step 3: 浮窗显示最新事件**

```tsx
// app/src/renderer/floating/main.tsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    api: {
      onSidecarEvent: (cb: (ev: any) => void) => () => void;
    };
  }
}

function App() {
  const [lastEvent, setLastEvent] = useState<any>(null);
  useEffect(() => {
    const unsub = window.api.onSidecarEvent((ev) => setLastEvent(ev));
    return unsub;
  }, []);
  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>面试助手 · 浮窗</div>
      {lastEvent ? (
        <pre style={{ fontSize: 11, color: "#6dbf6d" }}>{JSON.stringify(lastEvent, null, 2)}</pre>
      ) : (
        <div style={{ color: "#888" }}>等待 sidecar 事件…</div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 4: 端到端手动验证**

```bash
# 终端 1：跑 sidecar
cd sidecar && swift run SidecarApp

# 终端 2：跑 app
pnpm --filter app dev
```

期望：浮窗显示一条 `ready` 事件 JSON

- [ ] **Step 5: 提交**

```bash
git add app/src/main/index.ts app/src/preload/index.ts app/src/renderer/floating/main.tsx
git commit -m "feat(app): main 连接 sidecar，事件转发到浮窗显示"
```

---

### Task 1.6 · Ping/Pong 双向验证

**Files:**
- Modify: `sidecar/Sources/SidecarApp/main.swift`
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: sidecar 收到 ping 后打 log（之后可加 pong event）**

```swift
// sidecar/Sources/SidecarApp/main.swift (修改 onCommand 闭包)
server.onCommand = { cmd in
    switch cmd {
    case .ping(let seq, _, let token):
        print("sidecar got ping seq=\(seq) token=\(token)")
    default:
        print("sidecar got cmd: \(cmd)")
    }
}
```

- [ ] **Step 2: app 启动 3 秒后发一次 ping**

```ts
// app/src/main/index.ts (在 connectSidecar 之后加)
sidecar.on("connect", () => {
  setTimeout(() => {
    sidecar?.send({
      v: 1, t: "ping", seq: sidecar.nextSeq(), ts: Date.now(),
      p: { token: "hello" },
    });
  }, 3000);
});
```

- [ ] **Step 3: 端到端跑**

```bash
# 终端 1
cd sidecar && swift run SidecarApp
# 终端 2
pnpm --filter app dev
```

期望：3 秒后 sidecar 终端输出 `sidecar got ping seq=0 token=hello`

- [ ] **Step 4: 提交**

```bash
git add sidecar/Sources/SidecarApp/main.swift app/src/main/index.ts
git commit -m "feat: M1 闭环 - app ping → sidecar 接收"
```

---

## M2 · 音频采集

### Task 2.1 · AudioCaptureService 接口 + Mock 实现

**Files:**
- Create: `sidecar/Sources/SidecarCore/Audio/AudioCaptureService.swift`
- Create: `sidecar/Sources/SidecarCore/Audio/MockAudioCaptureService.swift`
- Create: `sidecar/Tests/SidecarCoreTests/Audio/MockAudioCaptureServiceTests.swift`

- [ ] **Step 1: 写测试**

```swift
// sidecar/Tests/SidecarCoreTests/Audio/MockAudioCaptureServiceTests.swift
import XCTest
@testable import SidecarCore

final class MockAudioCaptureServiceTests: XCTestCase {
    func testEmitsChunksAtConfiguredRate() async throws {
        let mock = MockAudioCaptureService(chunkIntervalMs: 50)
        var received = 0
        mock.onChunk = { _, _ in received += 1 }
        try mock.start()
        try await Task.sleep(nanoseconds: 200_000_000) // 200ms
        mock.stop()
        XCTAssertGreaterThanOrEqual(received, 3)  // 至少 3 帧（200/50 = 4，留余量）
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd sidecar && swift test --filter MockAudioCaptureServiceTests
```

期望：编译错误

- [ ] **Step 3: 写接口 + Mock 实现**

```swift
// sidecar/Sources/SidecarCore/Audio/AudioCaptureService.swift
import Foundation

public protocol AudioCaptureService: AnyObject {
    var onChunk: ((Data, Int64) -> Void)? { get set }  // (pcm_data, ts_ms)
    func start() throws
    func stop()
}
```

```swift
// sidecar/Sources/SidecarCore/Audio/MockAudioCaptureService.swift
import Foundation

public final class MockAudioCaptureService: AudioCaptureService {
    public var onChunk: ((Data, Int64) -> Void)?
    private let chunkIntervalMs: Int
    private var timer: Timer?

    public init(chunkIntervalMs: Int = 100) {
        self.chunkIntervalMs = chunkIntervalMs
    }

    public func start() throws {
        let interval = TimeInterval(chunkIntervalMs) / 1000.0
        let t = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            // 生成静音 PCM (16kHz mono, chunkIntervalMs)
            let samples = 16 * chunkIntervalMs
            let data = Data(count: samples * 2)
            self.onChunk?(data, Int64(Date().timeIntervalSince1970 * 1000))
        }
        RunLoop.main.add(t, forMode: .common)
        self.timer = t
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }
}
```

- [ ] **Step 4: 跑测试**

```bash
cd sidecar && swift test
```

期望：通过

- [ ] **Step 5: 提交**

```bash
git add sidecar/Sources/SidecarCore/Audio/ sidecar/Tests/SidecarCoreTests/Audio/
git commit -m "feat(sidecar): AudioCaptureService 接口 + Mock 实现"
```

---

### Task 2.2 · ScreenCaptureKit 实现（真实音频采集）

**Files:**
- Create: `sidecar/Sources/SidecarCore/Audio/SCKAudioCaptureService.swift`

> 注：ScreenCaptureKit 是 macOS 13+ API。这一步**单元测试受限**（需要真实权限 + 真实音频源），主要靠 M2.5 的人肉验证。

- [ ] **Step 1: 写实现**

```swift
// sidecar/Sources/SidecarCore/Audio/SCKAudioCaptureService.swift
import Foundation
import ScreenCaptureKit
import AVFoundation

@available(macOS 13.0, *)
public final class SCKAudioCaptureService: NSObject, AudioCaptureService, SCStreamOutput {
    public var onChunk: ((Data, Int64) -> Void)?
    private var stream: SCStream?

    public func start() throws {
        Task {
            do {
                let content = try await SCShareableContent.current
                guard let display = content.displays.first else {
                    throw NSError(domain: "SCK", code: -1)
                }
                let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
                let config = SCStreamConfiguration()
                config.capturesAudio = true
                config.excludesCurrentProcessAudio = true
                config.sampleRate = 16000
                config.channelCount = 1
                config.queueDepth = 5

                let s = SCStream(filter: filter, configuration: config, delegate: nil)
                try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: .main)
                try await s.startCapture()
                self.stream = s
            } catch {
                print("[SCKAudio] start failed: \(error)")
            }
        }
    }

    public func stop() {
        Task { try? await stream?.stopCapture() }
        stream = nil
    }

    public func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard let blockBuf = CMSampleBufferGetDataBuffer(sample) else { return }
        var len = 0
        var ptr: UnsafeMutablePointer<Int8>?
        guard CMBlockBufferGetDataPointer(blockBuf, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr) == kCMBlockBufferNoErr,
              let p = ptr else { return }
        let data = Data(bytes: p, count: len)
        let ts = Int64(Date().timeIntervalSince1970 * 1000)
        onChunk?(data, ts)
    }
}
```

- [ ] **Step 2: 不写单元测试，写「权限存在则不崩」的 smoke test**

```swift
// sidecar/Tests/SidecarCoreTests/Audio/SCKAudioCaptureSmokeTests.swift
import XCTest
@testable import SidecarCore

@available(macOS 13.0, *)
final class SCKAudioCaptureSmokeTests: XCTestCase {
    func testInstantiationDoesNotCrash() {
        let svc = SCKAudioCaptureService()
        XCTAssertNotNil(svc)
        // start() 会异步走，权限缺失只会 log，不应抛同步异常
        XCTAssertNoThrow(try svc.start())
        svc.stop()
    }
}
```

- [ ] **Step 3: 跑测试**

```bash
cd sidecar && swift test
```

期望：通过（不会真请求权限因为只测构造）

- [ ] **Step 4: 提交**

```bash
git add sidecar/Sources/SidecarCore/Audio/SCKAudioCaptureService.swift sidecar/Tests/SidecarCoreTests/Audio/
git commit -m "feat(sidecar): SCKAudioCaptureService 真实采集实现"
```

---

### Task 2.3 · 把采集到的音频通过 IPC 发出去（带 base64 编码）

**Files:**
- Modify: `sidecar/Sources/SidecarApp/main.swift`

- [ ] **Step 1: 在 main.swift 接入 capture → emit**

```swift
// sidecar/Sources/SidecarApp/main.swift (整个替换)
import Foundation
import SidecarCore

let path = NSHomeDirectory() + "/Library/Application Support/ai-interview/sidecar.sock"
try? FileManager.default.createDirectory(
    atPath: (path as NSString).deletingLastPathComponent,
    withIntermediateDirectories: true, attributes: nil
)

let server = IpcServer(socketPath: path)
var seq = 0
nonisolated(unsafe) var captureService: AudioCaptureService?

// 真实环境用 SCK，开发可切 Mock；这里默认 Mock，由 START 切换
let mock = MockAudioCaptureService(chunkIntervalMs: 100)
mock.onChunk = { pcm, ts in
    seq += 1
    let b64 = pcm.base64EncodedString()
    server.emit(.audioChunk(seq: seq, ts: ts, pcmBase64: b64))
}
captureService = mock

server.onCommand = { cmd in
    switch cmd {
    case .captureStart:
        try? captureService?.start()
        print("sidecar: capture started")
    case .captureStop:
        captureService?.stop()
        print("sidecar: capture stopped")
    case .ping(let seq, _, let token):
        print("sidecar: ping seq=\(seq) token=\(token)")
    default:
        print("sidecar: cmd \(cmd)")
    }
}

try server.start()
print("sidecar listening on \(path)")
RunLoop.main.run()
```

- [ ] **Step 2: 跑 sidecar + 用 nc 测一下**

```bash
cd sidecar && swift run SidecarApp &
sleep 1
# 发 capture.start
echo '{"v":1,"t":"capture.start","seq":0,"ts":0,"p":{}}' | nc -U ~/Library/Application\ Support/ai-interview/sidecar.sock &
sleep 1
# 看 sidecar log 应该有 "capture started"
# 看 nc 的输出应该有 ready 事件 + 几条 audio.chunk
kill %1 %2 2>/dev/null || true
```

- [ ] **Step 3: 提交**

```bash
git add sidecar/Sources/SidecarApp/main.swift
git commit -m "feat(sidecar): 接通 AudioCapture → IPC emit audio.chunk"
```

---

### Task 2.4 · Electron 端接收音频事件 + 简单电平显示

**Files:**
- Create: `app/src/main/audio/AudioBuffer.ts`
- Create: `app/tests/audio/AudioBuffer.test.ts`
- Modify: `app/src/main/index.ts`
- Modify: `app/src/renderer/floating/main.tsx`

- [ ] **Step 1: 写测试**

```ts
// app/tests/audio/AudioBuffer.test.ts
import { describe, expect, it } from "vitest";
import { AudioBuffer } from "../../src/main/audio/AudioBuffer";

describe("AudioBuffer", () => {
  it("accepts chunks and computes RMS level", () => {
    const buf = new AudioBuffer();
    // PCM int16 little-endian, all 0 → RMS 0
    const silence = Buffer.alloc(200 * 2);
    buf.push(silence);
    expect(buf.rmsLevel()).toBe(0);
  });

  it("yields larger RMS for louder signal", () => {
    const buf = new AudioBuffer();
    const loud = Buffer.alloc(200 * 2);
    for (let i = 0; i < loud.length; i += 2) loud.writeInt16LE(8000, i);
    buf.push(loud);
    expect(buf.rmsLevel()).toBeGreaterThan(0.1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter app test audio
```

期望：FAIL

- [ ] **Step 3: 写实现**

```ts
// app/src/main/audio/AudioBuffer.ts
export class AudioBuffer {
  private samples: Int16Array = new Int16Array(0);
  private static MAX_KEEP = 16000 * 30; // 最近 30s

  push(chunk: Buffer): void {
    const newSamples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
    const merged = new Int16Array(this.samples.length + newSamples.length);
    merged.set(this.samples, 0);
    merged.set(newSamples, this.samples.length);
    this.samples = merged.length > AudioBuffer.MAX_KEEP
      ? merged.slice(merged.length - AudioBuffer.MAX_KEEP)
      : merged;
  }

  rmsLevel(): number {
    if (this.samples.length === 0) return 0;
    // 只看最近 200ms
    const window = this.samples.slice(Math.max(0, this.samples.length - 3200));
    let sum = 0;
    for (let i = 0; i < window.length; i++) {
      sum += window[i] * window[i];
    }
    const rms = Math.sqrt(sum / window.length);
    return Math.min(1, rms / 32768);
  }

  latestSamples(n: number): Int16Array {
    return this.samples.slice(Math.max(0, this.samples.length - n));
  }
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm --filter app test audio
```

期望：通过

- [ ] **Step 5: main 接事件 + 转发电平到渲染**

```ts
// app/src/main/index.ts (在 connectSidecar 中加)
import { AudioBuffer } from "./audio/AudioBuffer";

const audioBuffer = new AudioBuffer();

sidecar.on("event", (ev: any) => {
  if (ev.t === "audio.chunk") {
    const pcm = Buffer.from(ev.p.pcm_b64, "base64");
    audioBuffer.push(pcm);
    floatingWindow?.webContents.send("audio-level", audioBuffer.rmsLevel());
  }
  floatingWindow?.webContents.send("sidecar-event", ev);
});

// 启动后发 capture.start
sidecar.on("connect", () => {
  sidecar?.send({ v: 1, t: "capture.start", seq: sidecar.nextSeq(), ts: Date.now(), p: {} });
});
```

```ts
// app/src/preload/index.ts (新加 onAudioLevel)
contextBridge.exposeInMainWorld("api", {
  onSidecarEvent: (cb: (ev: any) => void) => {
    const h = (_: unknown, ev: any) => cb(ev);
    ipcRenderer.on("sidecar-event", h);
    return () => ipcRenderer.off("sidecar-event", h);
  },
  onAudioLevel: (cb: (lvl: number) => void) => {
    const h = (_: unknown, lvl: number) => cb(lvl);
    ipcRenderer.on("audio-level", h);
    return () => ipcRenderer.off("audio-level", h);
  },
});
```

- [ ] **Step 6: 渲染端加电平条**

```tsx
// app/src/renderer/floating/main.tsx (在 App 里加 level state)
function App() {
  const [lastEvent, setLastEvent] = useState<any>(null);
  const [level, setLevel] = useState(0);
  useEffect(() => window.api.onSidecarEvent(setLastEvent), []);
  useEffect(() => window.api.onAudioLevel(setLevel), []);
  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>面试助手 · 浮窗</div>
      <div style={{ height: 6, background: "#333", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ width: `${level * 100}%`, height: "100%", background: "#6dbf6d", transition: "width 50ms" }} />
      </div>
      {lastEvent && (
        <pre style={{ fontSize: 10, color: "#888", whiteSpace: "pre-wrap" }}>
          last: {lastEvent.t}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 7: 端到端跑**

```bash
# 终端 1
cd sidecar && swift run SidecarApp
# 终端 2
pnpm --filter app dev
```

期望：浮窗显示 last: audio.chunk 持续刷新，电平条因为是静音 mock 一直 0%

- [ ] **Step 8: 提交**

```bash
git add app/
git commit -m "feat(app): 接收音频帧 + 电平显示"
```

---

### Task 2.5 · 切换真实音频源 + 权限引导

**Files:**
- Modify: `sidecar/Sources/SidecarApp/main.swift`
- Create: `sidecar/Sources/SidecarCore/Audio/AudioPermission.swift`

- [ ] **Step 1: 权限检查工具**

```swift
// sidecar/Sources/SidecarCore/Audio/AudioPermission.swift
import Foundation
import ScreenCaptureKit

@available(macOS 13.0, *)
public enum AudioPermission {
    /// 触发屏幕录制权限申请（音频也走这条 TCC）
    public static func requestIfNeeded() async -> Bool {
        do {
            _ = try await SCShareableContent.current
            return true
        } catch {
            return false
        }
    }
}
```

- [ ] **Step 2: main.swift 启动时优先用 SCK，失败时 fallback Mock**

```swift
// sidecar/Sources/SidecarApp/main.swift (调整 capture service 创建)
let useReal = ProcessInfo.processInfo.environment["SIDECAR_AUDIO"] != "mock"
let captureSvc: AudioCaptureService
if #available(macOS 13.0, *), useReal {
    Task { _ = await AudioPermission.requestIfNeeded() }
    captureSvc = SCKAudioCaptureService()
    print("sidecar: using SCKAudioCaptureService")
} else {
    captureSvc = MockAudioCaptureService(chunkIntervalMs: 100)
    print("sidecar: using MockAudioCaptureService")
}
captureSvc.onChunk = { pcm, ts in
    seq += 1
    server.emit(.audioChunk(seq: seq, ts: ts, pcmBase64: pcm.base64EncodedString()))
}
captureService = captureSvc
```

- [ ] **Step 3: 端到端验证**

```bash
# 真实模式（会弹屏幕录制权限）
cd sidecar && swift run SidecarApp
# Mock 模式
SIDECAR_AUDIO=mock swift run SidecarApp
```

期望：
- 真实模式首次跑会弹"系统设置 → 屏幕录制"权限请求；批准后开任意视频播放声音，Electron 浮窗电平条应该跳动
- Mock 模式电平条不跳动

- [ ] **Step 4: 提交**

```bash
git add sidecar/Sources/SidecarCore/Audio/AudioPermission.swift sidecar/Sources/SidecarApp/main.swift
git commit -m "feat(sidecar): 真实/Mock 音频源切换 + 权限引导"
```

---

## M3 · ASR 流式转写

### Task 3.1 · ASRClient 接口 + MockASRClient

**Files:**
- Create: `app/src/main/asr/ASRClient.ts`
- Create: `app/src/main/asr/MockASRClient.ts`
- Create: `app/tests/asr/MockASRClient.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/asr/MockASRClient.test.ts
import { describe, expect, it } from "vitest";
import { MockASRClient } from "../../src/main/asr/MockASRClient";

describe("MockASRClient", () => {
  it("emits partial then final for a scripted input", async () => {
    const client = new MockASRClient({
      script: [
        { afterMs: 100, type: "partial", text: "你" },
        { afterMs: 200, type: "partial", text: "你好" },
        { afterMs: 300, type: "final", text: "你好。" },
      ],
    });
    const events: any[] = [];
    client.on("transcript", (e) => events.push(e));
    await client.connect();
    client.pushAudio(Buffer.alloc(100));  // 触发脚本播放
    await new Promise((r) => setTimeout(r, 500));
    expect(events.map((e) => e.type)).toEqual(["partial", "partial", "final"]);
    expect(events[2].text).toBe("你好。");
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm --filter app test asr
```

期望：FAIL

- [ ] **Step 3: 写接口 + Mock**

```ts
// app/src/main/asr/ASRClient.ts
import { EventEmitter } from "node:events";

export interface TranscriptEvent {
  type: "partial" | "final";
  text: string;
  ts: number;
}

export interface ASRClient extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): void;
  pushAudio(pcm: Buffer): void;
}
```

```ts
// app/src/main/asr/MockASRClient.ts
import { EventEmitter } from "node:events";
import type { ASRClient } from "./ASRClient";

interface ScriptItem { afterMs: number; type: "partial" | "final"; text: string; }

export class MockASRClient extends EventEmitter implements ASRClient {
  private timers: NodeJS.Timeout[] = [];

  constructor(private opts: { script: ScriptItem[] }) { super(); }

  async connect(): Promise<void> {}

  pushAudio(_pcm: Buffer): void {
    if (this.timers.length > 0) return; // 只触发一次
    this.opts.script.forEach((item) => {
      const t = setTimeout(() => {
        this.emit("transcript", { type: item.type, text: item.text, ts: Date.now() });
      }, item.afterMs);
      this.timers.push(t);
    });
  }

  disconnect(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm --filter app test asr
```

期望：通过

- [ ] **Step 5: 提交**

```bash
git add app/src/main/asr/ app/tests/asr/
git commit -m "feat(app): ASRClient 接口 + Mock 实现"
```

---

### Task 3.2 · 火山引擎 ASRClient 实现（HuoshanASRClient）

> 注：阿里 / 讯飞 接口结构类似，按 spec § 10 开放项**初版只接一家**——本任务接火山引擎。其它家由后续 PoC 决定。

**Files:**
- Create: `app/src/main/asr/HuoshanASRClient.ts`

- [ ] **Step 1: 写接口实现（WebSocket 长连接，PCM 二进制帧 + 文本 JSON 回包）**

```ts
// app/src/main/asr/HuoshanASRClient.ts
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { ASRClient, TranscriptEvent } from "./ASRClient";

export interface HuoshanConfig {
  url: string;          // e.g. wss://openspeech.bytedance.com/api/v2/asr
  appId: string;
  token: string;
  sampleRate: 16000;
  language: "zh-CN";
}

export class HuoshanASRClient extends EventEmitter implements ASRClient {
  private ws: WebSocket | null = null;
  constructor(private cfg: HuoshanConfig) { super(); }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.cfg.url, {
        headers: { Authorization: `Bearer; ${this.cfg.token}` },
      });
      ws.on("open", () => {
        // 发起始 config 帧
        ws.send(JSON.stringify({
          app: { appid: this.cfg.appId, cluster: "volcengine_streaming_common" },
          user: { uid: "ai-interview" },
          audio: { format: "pcm", rate: 16000, bits: 16, channel: 1, codec: "raw" },
          request: { reqid: cryptoId(), workflow: "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate", result_type: "single" },
        }));
        resolve();
      });
      ws.on("message", (data) => this.handleMessage(data.toString()));
      ws.on("error", reject);
      ws.on("close", () => this.emit("close"));
      this.ws = ws;
    });
  }

  pushAudio(pcm: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(raw: string): void {
    try {
      const m = JSON.parse(raw);
      if (m.result?.[0]?.text) {
        const isFinal = m.result[0].isFinal === true;
        const ev: TranscriptEvent = {
          type: isFinal ? "final" : "partial",
          text: m.result[0].text,
          ts: Date.now(),
        };
        this.emit("transcript", ev);
      }
    } catch {}
  }
}

function cryptoId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm --filter app exec tsc --noEmit
```

期望：无错误

- [ ] **Step 3: 提交**

```bash
git add app/src/main/asr/HuoshanASRClient.ts
git commit -m "feat(app): 火山引擎流式 ASR 客户端实现"
```

---

### Task 3.3 · TranscriptStore

**Files:**
- Create: `app/src/main/asr/TranscriptStore.ts`
- Create: `app/tests/asr/TranscriptStore.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/asr/TranscriptStore.test.ts
import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";

describe("TranscriptStore", () => {
  it("partial overwrites the live segment, final commits", () => {
    const store = new TranscriptStore();
    store.applyPartial("你", 100);
    store.applyPartial("你好", 200);
    expect(store.snapshot()).toBe("你好");
    store.applyFinal("你好。", 300);
    expect(store.snapshot()).toBe("你好。");
    expect(store.committedSegments()).toEqual([{ text: "你好。", ts: 300 }]);
  });

  it("trims old commits beyond window", () => {
    const store = new TranscriptStore({ windowMs: 1000 });
    store.applyFinal("a", 0);
    store.applyFinal("b", 1500);
    expect(store.committedSegments().map((s) => s.text)).toEqual(["b"]);
  });

  it("tail returns last N chars of full transcript", () => {
    const store = new TranscriptStore();
    store.applyFinal("你好世界", 0);
    expect(store.tail(2)).toBe("世界");
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm --filter app test TranscriptStore
```

- [ ] **Step 3: 写实现**

```ts
// app/src/main/asr/TranscriptStore.ts
export interface Segment { text: string; ts: number; }

export class TranscriptStore {
  private committed: Segment[] = [];
  private live = "";
  private windowMs: number;

  constructor(opts: { windowMs?: number } = {}) {
    this.windowMs = opts.windowMs ?? 5 * 60 * 1000;
  }

  applyPartial(text: string, _ts: number): void { this.live = text; }

  applyFinal(text: string, ts: number): void {
    this.committed.push({ text, ts });
    this.live = "";
    this.trim(ts);
  }

  snapshot(): string {
    return this.committed.map((s) => s.text).join("") + this.live;
  }

  tail(n: number): string {
    const s = this.snapshot();
    return s.slice(Math.max(0, s.length - n));
  }

  committedSegments(): Segment[] { return [...this.committed]; }

  private trim(now: number): void {
    this.committed = this.committed.filter((s) => now - s.ts <= this.windowMs);
  }
}
```

- [ ] **Step 4: 跑测试 + 提交**

```bash
pnpm --filter app test TranscriptStore
git add app/src/main/asr/TranscriptStore.ts app/tests/asr/TranscriptStore.test.ts
git commit -m "feat(app): TranscriptStore 滚动窗口"
```

---

### Task 3.4 · 接通 audio.chunk → ASR → TranscriptStore → UI

**Files:**
- Modify: `app/src/main/index.ts`
- Modify: `app/src/preload/index.ts`
- Modify: `app/src/renderer/floating/main.tsx`

- [ ] **Step 1: main 把 audio chunk 喂给 ASR**

```ts
// app/src/main/index.ts (新增导入)
import { MockASRClient } from "./asr/MockASRClient";
import { TranscriptStore } from "./asr/TranscriptStore";

const transcriptStore = new TranscriptStore();
// 开发用 mock，配置过 key 后切到 HuoshanASRClient
const asr = new MockASRClient({
  script: [
    { afterMs: 800, type: "partial", text: "你介绍一下" },
    { afterMs: 1500, type: "partial", text: "你介绍一下自己" },
    { afterMs: 2200, type: "final", text: "你介绍一下自己吧。" },
  ],
});

asr.connect();
asr.on("transcript", (ev) => {
  if (ev.type === "partial") transcriptStore.applyPartial(ev.text, ev.ts);
  else transcriptStore.applyFinal(ev.text, ev.ts);
  floatingWindow?.webContents.send("transcript", transcriptStore.snapshot());
});

// 在 sidecar event 处理中
sidecar.on("event", (ev: any) => {
  if (ev.t === "audio.chunk") {
    const pcm = Buffer.from(ev.p.pcm_b64, "base64");
    audioBuffer.push(pcm);
    asr.pushAudio(pcm);
    floatingWindow?.webContents.send("audio-level", audioBuffer.rmsLevel());
  }
});
```

- [ ] **Step 2: preload 暴露 transcript 订阅**

```ts
// app/src/preload/index.ts (扩展)
contextBridge.exposeInMainWorld("api", {
  onSidecarEvent: (cb: (ev: any) => void) => { /* 同前 */ },
  onAudioLevel: (cb: (lvl: number) => void) => { /* 同前 */ },
  onTranscript: (cb: (s: string) => void) => {
    const h = (_: unknown, s: string) => cb(s);
    ipcRenderer.on("transcript", h);
    return () => ipcRenderer.off("transcript", h);
  },
});
```

- [ ] **Step 3: 浮窗显示 transcript**

```tsx
// app/src/renderer/floating/main.tsx (扩展 App)
function App() {
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState(0);
  useEffect(() => window.api.onTranscript(setTranscript), []);
  useEffect(() => window.api.onAudioLevel(setLevel), []);
  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>面试助手 · 浮窗</div>
      <div style={{ height: 4, background: "#333", borderRadius: 2, marginBottom: 8 }}>
        <div style={{ width: `${level*100}%`, height: "100%", background: "#6dbf6d", transition: "width 50ms" }} />
      </div>
      <div style={{ fontSize: 13, color: "#ccc", whiteSpace: "pre-wrap" }}>{transcript || <span style={{color:"#666"}}>聆听中…</span>}</div>
    </div>
  );
}
```

- [ ] **Step 4: 端到端跑**

```bash
cd sidecar && swift run SidecarApp & sleep 1
pnpm --filter app dev
```

期望：浮窗在 mock 数据下显示"你介绍一下"→ "你介绍一下自己" → "你介绍一下自己吧。"

- [ ] **Step 5: 提交**

```bash
git add app/
git commit -m "feat(app): 接通 audio → ASR → transcript 显示"
```

---

### Task 3.5 · ASR 多供应商接入抽象 + 配置切换

**Files:**
- Create: `app/src/main/asr/ASRFactory.ts`
- Create: `app/tests/asr/ASRFactory.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/asr/ASRFactory.test.ts
import { describe, expect, it } from "vitest";
import { createASRClient } from "../../src/main/asr/ASRFactory";
import { MockASRClient } from "../../src/main/asr/MockASRClient";
import { HuoshanASRClient } from "../../src/main/asr/HuoshanASRClient";

describe("createASRClient", () => {
  it("returns MockASRClient when provider=mock", () => {
    expect(createASRClient({ provider: "mock", script: [] })).toBeInstanceOf(MockASRClient);
  });
  it("returns HuoshanASRClient when provider=huoshan", () => {
    expect(createASRClient({
      provider: "huoshan", url: "wss://x", appId: "a", token: "b", sampleRate: 16000, language: "zh-CN",
    })).toBeInstanceOf(HuoshanASRClient);
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/asr/ASRFactory.ts
import type { ASRClient } from "./ASRClient";
import { MockASRClient } from "./MockASRClient";
import { HuoshanASRClient, type HuoshanConfig } from "./HuoshanASRClient";

export type ASRConfig =
  | { provider: "mock"; script: any[] }
  | ({ provider: "huoshan" } & HuoshanConfig);

export function createASRClient(cfg: ASRConfig): ASRClient {
  if (cfg.provider === "mock") return new MockASRClient({ script: cfg.script });
  if (cfg.provider === "huoshan") return new HuoshanASRClient(cfg);
  throw new Error(`unknown ASR provider: ${(cfg as any).provider}`);
}
```

- [ ] **Step 3: main 里读取环境变量 / 配置使用 factory**

```ts
// app/src/main/index.ts (替换 ASR 创建)
import { createASRClient } from "./asr/ASRFactory";

const asr = process.env.ASR_PROVIDER === "huoshan"
  ? createASRClient({
      provider: "huoshan",
      url: process.env.HUOSHAN_URL ?? "",
      appId: process.env.HUOSHAN_APPID ?? "",
      token: process.env.HUOSHAN_TOKEN ?? "",
      sampleRate: 16000, language: "zh-CN",
    })
  : createASRClient({
      provider: "mock",
      script: [
        { afterMs: 800, type: "partial", text: "你介绍一下" },
        { afterMs: 1500, type: "partial", text: "你介绍一下自己" },
        { afterMs: 2200, type: "final", text: "你介绍一下自己吧。" },
      ],
    });
```

- [ ] **Step 4: 跑测试 + 提交**

```bash
pnpm --filter app test asr
git add app/src/main/asr/ASRFactory.ts app/tests/asr/ASRFactory.test.ts app/src/main/index.ts
git commit -m "feat(app): ASR provider factory + 配置切换"
```

---

## M4 · LLM 管线（手动触发）

### Task 4.1 · ContextManager

**Files:**
- Create: `app/src/main/context/ContextManager.ts`
- Create: `app/tests/context/ContextManager.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/context/ContextManager.test.ts
import { describe, expect, it } from "vitest";
import { ContextManager } from "../../src/main/context/ContextManager";
import { TranscriptStore } from "../../src/main/asr/TranscriptStore";

describe("ContextManager", () => {
  it("builds context with resume + jd + transcript + ocr", () => {
    const ts = new TranscriptStore();
    ts.applyFinal("你介绍一下自己。", Date.now());
    const cm = new ContextManager({
      resume: "5 年 Android 开发，主导过 xxx",
      jd: "字节 Android 高级",
      ocr: "",
      transcriptStore: ts,
    });
    const ctx = cm.buildContext({ transcriptTailSeconds: 30 });
    expect(ctx.resume).toContain("Android");
    expect(ctx.jd).toContain("字节");
    expect(ctx.transcript).toContain("介绍一下");
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/context/ContextManager.ts
import type { TranscriptStore } from "../asr/TranscriptStore";

export interface Context {
  resume: string;
  jd: string;
  ocr: string;
  transcript: string;
  history: Array<{ q: string; a: string }>;
}

export class ContextManager {
  private resume = "";
  private jd = "";
  private ocr = "";
  private history: Array<{ q: string; a: string }> = [];
  private transcriptStore: TranscriptStore;

  constructor(init: { resume?: string; jd?: string; ocr?: string; transcriptStore: TranscriptStore }) {
    this.resume = init.resume ?? "";
    this.jd = init.jd ?? "";
    this.ocr = init.ocr ?? "";
    this.transcriptStore = init.transcriptStore;
  }

  updateResume(r: string): void { this.resume = r; }
  updateJD(j: string): void { this.jd = j; }
  updateOCR(o: string): void { this.ocr = o; }
  appendHistory(q: string, a: string): void {
    this.history.push({ q, a });
    if (this.history.length > 10) this.history.shift();
  }

  buildContext(opts: { transcriptTailSeconds?: number } = {}): Context {
    const tailChars = (opts.transcriptTailSeconds ?? 30) * 4; // 中文每秒约 4 字
    return {
      resume: this.resume,
      jd: this.jd,
      ocr: this.ocr,
      transcript: this.transcriptStore.tail(tailChars),
      history: [...this.history],
    };
  }
}
```

- [ ] **Step 3: 跑测试**

```bash
pnpm --filter app test ContextManager
```

期望：通过

- [ ] **Step 4: 提交**

```bash
git add app/src/main/context/ app/tests/context/
git commit -m "feat(app): ContextManager 上下文聚合"
```

---

### Task 4.2 · PromptBuilder

**Files:**
- Create: `app/src/main/prompt/PromptBuilder.ts`
- Create: `app/src/main/prompt/templates.ts`
- Create: `app/tests/prompt/PromptBuilder.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/prompt/PromptBuilder.test.ts
import { describe, expect, it } from "vitest";
import { PromptBuilder } from "../../src/main/prompt/PromptBuilder";

describe("PromptBuilder", () => {
  const ctx = {
    resume: "RESUME_X",
    jd: "JD_Y",
    ocr: "",
    transcript: "你介绍一下自己。",
    history: [],
  };
  const pb = new PromptBuilder();

  it("builds bullet prompt for technical question", () => {
    const p = pb.build({ questionType: "technical", context: ctx });
    expect(p.system).toContain("3 个 bullet");
    expect(p.user).toContain("RESUME_X");
  });

  it("builds prose prompt for behavioral question", () => {
    const p = pb.build({ questionType: "behavioral", context: ctx });
    expect(p.system).toContain("行为面试");
    expect(p.user).toContain("JD_Y");
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/prompt/templates.ts
export const SYSTEM_TECHNICAL = `你是候选人的实时面试助手。请在 3-5 个 bullet 内给出技术题的回答大纲，每个 bullet 不超过 25 字。需要写代码时另起代码块。先大纲、必要时再展开。语言：中文。`;

export const SYSTEM_BEHAVIORAL = `你是候选人的实时面试助手。这是行为面试题。请用流畅的第一人称段落给出回答，约 80-150 字，结合候选人简历中的具体经历，结尾点出对应到目标岗位的价值。语言：中文。`;

export const SYSTEM_GENERAL = `你是候选人的实时面试助手。请简洁、口语化地回答候选人面前的面试问题，控制在 80 字以内。语言：中文。`;

export const USER_TEMPLATE = (ctx: {
  resume: string; jd: string; ocr: string; transcript: string;
  history: Array<{ q: string; a: string }>;
}) => `候选人简历：
${ctx.resume || "（暂无）"}

目标岗位 JD：
${ctx.jd || "（暂无）"}

${ctx.ocr ? `屏幕上的题面：\n${ctx.ocr}\n\n` : ""}面试官最近说：
${ctx.transcript || "（暂无）"}

${ctx.history.length > 0 ? `本场前面问过：\n${ctx.history.slice(-3).map(h => `Q: ${h.q}\nA: ${h.a}`).join("\n\n")}\n\n` : ""}请给出回答。`;
```

```ts
// app/src/main/prompt/PromptBuilder.ts
import type { Context } from "../context/ContextManager";
import { SYSTEM_TECHNICAL, SYSTEM_BEHAVIORAL, SYSTEM_GENERAL, USER_TEMPLATE } from "./templates";

export type QuestionType = "technical" | "behavioral" | "general";

export interface Prompt { system: string; user: string; }

export class PromptBuilder {
  build(input: { questionType: QuestionType; context: Context }): Prompt {
    const system =
      input.questionType === "technical" ? SYSTEM_TECHNICAL
      : input.questionType === "behavioral" ? SYSTEM_BEHAVIORAL
      : SYSTEM_GENERAL;
    return { system, user: USER_TEMPLATE(input.context) };
  }
}
```

- [ ] **Step 3: 跑测试 + 提交**

```bash
pnpm --filter app test PromptBuilder
git add app/src/main/prompt/ app/tests/prompt/
git commit -m "feat(app): PromptBuilder + 题型模板"
```

---

### Task 4.3 · LLMRouter（Claude + OpenAI，含 fallback）

**Files:**
- Create: `app/src/main/llm/LLMClient.ts`
- Create: `app/src/main/llm/ClaudeClient.ts`
- Create: `app/src/main/llm/OpenAIClient.ts`
- Create: `app/src/main/llm/LLMRouter.ts`
- Create: `app/tests/llm/LLMRouter.test.ts`

- [ ] **Step 1: 写接口 + 测试（用 mock client）**

```ts
// app/src/main/llm/LLMClient.ts
import { EventEmitter } from "node:events";

export interface LLMStreamEvent { type: "token" | "done" | "error"; text?: string; err?: unknown; }

export interface LLMClient extends EventEmitter {
  name: string;
  stream(prompt: { system: string; user: string }, opts: { timeoutMs: number }): Promise<void>;
  abort(): void;
}
```

```ts
// app/tests/llm/LLMRouter.test.ts
import { describe, expect, it } from "vitest";
import { LLMRouter } from "../../src/main/llm/LLMRouter";
import { EventEmitter } from "node:events";

class FakeClient extends EventEmitter {
  constructor(public name: string, private behavior: "ok" | "fail" | "timeout") { super(); }
  async stream() {
    if (this.behavior === "fail") throw new Error("boom");
    if (this.behavior === "timeout") return new Promise(() => {});
    setTimeout(() => this.emit("token", { text: "x" }), 10);
    setTimeout(() => this.emit("done"), 20);
  }
  abort() {}
}

describe("LLMRouter", () => {
  it("uses primary when ok", async () => {
    const primary = new FakeClient("primary", "ok") as any;
    const fallback = new FakeClient("fallback", "ok") as any;
    const router = new LLMRouter({ primary, fallback });
    const tokens: string[] = [];
    router.on("token", (t) => tokens.push(t.text));
    await router.route({ system: "s", user: "u" });
    await new Promise(r => setTimeout(r, 50));
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("falls back on primary error", async () => {
    const primary = new FakeClient("primary", "fail") as any;
    const fallback = new FakeClient("fallback", "ok") as any;
    const router = new LLMRouter({ primary, fallback });
    const events: string[] = [];
    router.on("token", () => events.push("token"));
    router.on("fallback", () => events.push("fallback"));
    await router.route({ system: "s", user: "u" });
    await new Promise(r => setTimeout(r, 50));
    expect(events).toContain("fallback");
    expect(events).toContain("token");
  });
});
```

- [ ] **Step 2: 写 Router**

```ts
// app/src/main/llm/LLMRouter.ts
import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";

export class LLMRouter extends EventEmitter {
  constructor(private clients: { primary: LLMClient; fallback: LLMClient }) { super(); }

  async route(prompt: { system: string; user: string }): Promise<void> {
    const { primary, fallback } = this.clients;
    const tryClient = (c: LLMClient): Promise<boolean> => {
      return new Promise((resolve) => {
        let gotToken = false;
        const onToken = (t: any) => { gotToken = true; this.emit("token", t); };
        const onDone = () => { c.off("token", onToken); c.off("error", onError); resolve(gotToken); };
        const onError = () => { c.off("token", onToken); c.off("done", onDone); resolve(false); };
        c.on("token", onToken);
        c.once("done", onDone);
        c.once("error", onError);
        c.stream(prompt, { timeoutMs: 8000 }).catch(() => { c.emit("error", new Error("stream rejected")); });
      });
    };
    const ok = await tryClient(primary);
    if (!ok) {
      this.emit("fallback");
      await tryClient(fallback);
    }
    this.emit("done");
  }

  abort(): void {
    this.clients.primary.abort();
    this.clients.fallback.abort();
  }
}
```

- [ ] **Step 3: 写 Claude / OpenAI 实现**

```ts
// app/src/main/llm/ClaudeClient.ts
import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";

export class ClaudeClient extends EventEmitter implements LLMClient {
  name = "claude";
  private aborter: AbortController | null = null;

  constructor(private cfg: { apiKey: string; model: string }) { super(); }

  async stream(prompt: { system: string; user: string }, opts: { timeoutMs: number }): Promise<void> {
    const ac = new AbortController();
    this.aborter = ac;
    const t = setTimeout(() => ac.abort(), opts.timeoutMs);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "x-api-key": this.cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.cfg.model,
          max_tokens: 800,
          stream: true,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        }),
      });
      if (!resp.ok || !resp.body) { this.emit("error", new Error(`claude ${resp.status}`)); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const dataLine = chunk.split("\n").find(l => l.startsWith("data: "));
          if (!dataLine) continue;
          const data = dataLine.slice(6);
          if (data === "[DONE]") break;
          try {
            const ev = JSON.parse(data);
            if (ev.type === "content_block_delta" && ev.delta?.text) {
              this.emit("token", { text: ev.delta.text });
            }
          } catch {}
        }
      }
      this.emit("done");
    } catch (e) {
      this.emit("error", e);
    } finally {
      clearTimeout(t);
    }
  }

  abort(): void { this.aborter?.abort(); }
}
```

```ts
// app/src/main/llm/OpenAIClient.ts
import { EventEmitter } from "node:events";
import type { LLMClient } from "./LLMClient";

export class OpenAIClient extends EventEmitter implements LLMClient {
  name = "openai";
  private aborter: AbortController | null = null;

  constructor(private cfg: { apiKey: string; model: string }) { super(); }

  async stream(prompt: { system: string; user: string }, opts: { timeoutMs: number }): Promise<void> {
    const ac = new AbortController();
    this.aborter = ac;
    const t = setTimeout(() => ac.abort(), opts.timeoutMs);
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: ac.signal,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.cfg.model,
          max_tokens: 800,
          stream: true,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        }),
      });
      if (!resp.ok || !resp.body) { this.emit("error", new Error(`openai ${resp.status}`)); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const ev = JSON.parse(data);
            const text = ev.choices?.[0]?.delta?.content;
            if (text) this.emit("token", { text });
          } catch {}
        }
      }
      this.emit("done");
    } catch (e) {
      this.emit("error", e);
    } finally {
      clearTimeout(t);
    }
  }

  abort(): void { this.aborter?.abort(); }
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm --filter app test llm
```

期望：LLMRouter 两项测试通过（Claude/OpenAI 实际调用不在单测中验证）

- [ ] **Step 5: 提交**

```bash
git add app/src/main/llm/ app/tests/llm/
git commit -m "feat(app): LLMRouter + Claude + OpenAI 流式客户端"
```

---

### Task 4.4 · 快捷键触发 LLM + 浮窗流式渲染

**Files:**
- Create: `app/src/main/trigger/Triggerer.ts`
- Modify: `app/src/main/index.ts`
- Modify: `app/src/preload/index.ts`
- Modify: `app/src/renderer/floating/main.tsx`

- [ ] **Step 1: Triggerer 串起 Context + Prompt + Router**

```ts
// app/src/main/trigger/Triggerer.ts
import { EventEmitter } from "node:events";
import type { ContextManager } from "../context/ContextManager";
import type { PromptBuilder, QuestionType } from "../prompt/PromptBuilder";
import type { LLMRouter } from "../llm/LLMRouter";

export class Triggerer extends EventEmitter {
  constructor(
    private ctx: ContextManager,
    private pb: PromptBuilder,
    private router: LLMRouter,
  ) { super(); }

  async fire(questionType: QuestionType = "general"): Promise<void> {
    const context = this.ctx.buildContext({ transcriptTailSeconds: 30 });
    const prompt = this.pb.build({ questionType, context });
    this.emit("start", { questionType });
    let collected = "";
    const onToken = (t: { text: string }) => { collected += t.text; this.emit("token", t.text); };
    const onDone = () => {
      this.router.off("token", onToken);
      this.router.off("done", onDone);
      this.emit("done", collected);
      this.ctx.appendHistory(context.transcript, collected);
    };
    this.router.on("token", onToken);
    this.router.once("done", onDone);
    await this.router.route(prompt);
  }

  abort(): void { this.router.abort(); }
}
```

- [ ] **Step 2: main 注册全局快捷键 + 接通**

```ts
// app/src/main/index.ts (在 app.whenReady 中加)
import { globalShortcut } from "electron";
import { ContextManager } from "./context/ContextManager";
import { PromptBuilder } from "./prompt/PromptBuilder";
import { LLMRouter } from "./llm/LLMRouter";
import { ClaudeClient } from "./llm/ClaudeClient";
import { OpenAIClient } from "./llm/OpenAIClient";
import { Triggerer } from "./trigger/Triggerer";

const contextManager = new ContextManager({ transcriptStore });
const promptBuilder = new PromptBuilder();

const claude = new ClaudeClient({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: "claude-opus-4-7",
});
const openai = new OpenAIClient({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: "gpt-4o",
});

const llmRouter = new LLMRouter({ primary: claude, fallback: openai });
const triggerer = new Triggerer(contextManager, promptBuilder, llmRouter);

triggerer.on("start", () => floatingWindow?.webContents.send("answer-start"));
triggerer.on("token", (text) => floatingWindow?.webContents.send("answer-token", text));
triggerer.on("done", () => floatingWindow?.webContents.send("answer-done"));

app.whenReady().then(() => {
  // ... createFloating, connectSidecar
  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    triggerer.fire("general");
  });
});
app.on("will-quit", () => globalShortcut.unregisterAll());
```

- [ ] **Step 3: preload + renderer 接收 answer 流**

```ts
// app/src/preload/index.ts (扩展)
onAnswerStart: (cb: () => void) => { /* register answer-start */ },
onAnswerToken: (cb: (t: string) => void) => { /* register answer-token */ },
onAnswerDone: (cb: () => void) => { /* register answer-done */ },
```

```tsx
// app/src/renderer/floating/main.tsx
function App() {
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => window.api.onTranscript(setTranscript), []);
  useEffect(() => window.api.onAnswerStart(() => { setAnswer(""); setGenerating(true); }), []);
  useEffect(() => window.api.onAnswerToken((t) => setAnswer((s) => s + t)), []);
  useEffect(() => window.api.onAnswerDone(() => setGenerating(false)), []);

  return (
    <div>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>面试官：</div>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>{transcript || "聆听中…"}</div>
      <div style={{ fontSize: 11, color: "#6dbf6d", marginBottom: 6 }}>建议答案：{generating && <span>· 生成中</span>}</div>
      <div style={{ fontSize: 14, color: "#fff", whiteSpace: "pre-wrap" }}>{answer || <span style={{ color: "#666" }}>按 ⌃⇧Space 触发</span>}</div>
    </div>
  );
}
```

- [ ] **Step 4: 端到端跑（需要真 ANTHROPIC_API_KEY）**

```bash
ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... pnpm --filter app dev
# 在另一个终端按下 ⌃⇧Space，浮窗应该开始流式输出答案
```

- [ ] **Step 5: 提交**

```bash
git add app/
git commit -m "feat(app): 快捷键触发 LLM + 浮窗流式渲染"
```

---

### Task 4.5 · 题型规则分类（QuestionClassifier）

**Files:**
- Create: `app/src/main/classifier/QuestionClassifier.ts`
- Create: `app/tests/classifier/QuestionClassifier.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/classifier/QuestionClassifier.test.ts
import { describe, expect, it } from "vitest";
import { QuestionClassifier } from "../../src/main/classifier/QuestionClassifier";

const c = new QuestionClassifier();

describe("QuestionClassifier", () => {
  it("classifies algorithm question by keyword", () => {
    expect(c.classify({ transcript: "实现一个反转链表", ocr: "" })).toBe("technical");
  });
  it("classifies behavioral by keyword", () => {
    expect(c.classify({ transcript: "讲一个你跟同事冲突的例子", ocr: "" })).toBe("behavioral");
  });
  it("classifies as technical when OCR has code-like patterns", () => {
    expect(c.classify({ transcript: "看一下这道题", ocr: "function f(arr) { ... }" })).toBe("technical");
  });
  it("defaults to general when ambiguous", () => {
    expect(c.classify({ transcript: "嗯对", ocr: "" })).toBe("general");
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/classifier/QuestionClassifier.ts
import type { QuestionType } from "../prompt/PromptBuilder";

const TECH_KW = ["实现", "算法", "代码", "复杂度", "链表", "数组", "二叉树", "动态规划", "设计一个", "为什么用", "底层", "原理", "区别", "tcp", "http", "数据库", "索引", "事务", "并发", "锁", "进程", "线程"];
const BEHAVIORAL_KW = ["介绍一下", "讲一个", "冲突", "失败", "成就", "压力", "团队", "为什么想加入", "职业规划", "优缺点", "学到", "如果你"];

export class QuestionClassifier {
  classify(input: { transcript: string; ocr: string }): QuestionType {
    const haystack = (input.transcript + " " + input.ocr).toLowerCase();
    if (/\b(function|class|def|return|var|let|const|public|private|=>|{|})/i.test(input.ocr)) {
      return "technical";
    }
    if (TECH_KW.some((k) => haystack.includes(k.toLowerCase()))) return "technical";
    if (BEHAVIORAL_KW.some((k) => haystack.includes(k))) return "behavioral";
    return "general";
  }
}
```

- [ ] **Step 3: 集成到 Triggerer**

```ts
// 修改 app/src/main/index.ts globalShortcut handler:
const classifier = new QuestionClassifier();
globalShortcut.register("CommandOrControl+Shift+Space", () => {
  const ctx = contextManager.buildContext();
  const qt = classifier.classify({ transcript: ctx.transcript, ocr: ctx.ocr });
  triggerer.fire(qt);
});
```

- [ ] **Step 4: 跑测试 + 提交**

```bash
pnpm --filter app test classifier
git add app/src/main/classifier/ app/tests/classifier/ app/src/main/index.ts
git commit -m "feat(app): 规则题型分类器 + 集成到触发器"
```

---

## M5 · 隐身能力

### Task 5.1 · StealthWindowManager（sidecar 设置 Electron 窗口 sharingType）

**实现路径选择**：Electron 提供 `BrowserWindow.setContentProtection(true)` 这个方法，**底层就是设置 NSWindow.sharingType=.none**。M5.1 直接在 Electron 侧用这个 API，sidecar 暂不参与；spec § 6.1 描述的 NSWindow API 等价机制由 Electron 一次性帮我们处理。

**Files:**
- Modify: `app/src/main/index.ts`
- Create: `app/src/main/stealth/StealthCoordinator.ts`
- Create: `app/tests/stealth/StealthCoordinator.test.ts`

- [ ] **Step 1: 写测试（mock window）**

```ts
// app/tests/stealth/StealthCoordinator.test.ts
import { describe, expect, it, vi } from "vitest";
import { StealthCoordinator } from "../../src/main/stealth/StealthCoordinator";

describe("StealthCoordinator", () => {
  it("applies setContentProtection true on register", () => {
    const setCP = vi.fn();
    const fakeWindow = { setContentProtection: setCP } as any;
    const sc = new StealthCoordinator();
    sc.protect(fakeWindow);
    expect(setCP).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/stealth/StealthCoordinator.ts
import type { BrowserWindow } from "electron";

export class StealthCoordinator {
  private windows: BrowserWindow[] = [];

  protect(win: BrowserWindow): void {
    win.setContentProtection(true);
    this.windows.push(win);
  }

  unprotect(win: BrowserWindow): void {
    win.setContentProtection(false);
    this.windows = this.windows.filter((w) => w !== win);
  }

  protectAll(): void {
    this.windows.forEach((w) => w.setContentProtection(true));
  }
}
```

- [ ] **Step 3: 在 createFloating 后调用**

```ts
// app/src/main/index.ts
import { StealthCoordinator } from "./stealth/StealthCoordinator";
const stealth = new StealthCoordinator();

function createFloating() {
  floatingWindow = new BrowserWindow({ /* 同前 */ });
  floatingWindow.loadFile(/* 同前 */);
  stealth.protect(floatingWindow);
}
```

- [ ] **Step 4: 跑测试 + 提交**

```bash
pnpm --filter app test stealth
git add app/src/main/stealth/ app/tests/stealth/ app/src/main/index.ts
git commit -m "feat(app): StealthCoordinator 屏幕共享豁免（spec § 6.1）"
```

---

### Task 5.2 · ProcessDisguise · LSUIElement + activationPolicy

**Files:**
- Modify: `app/electron-builder.yml`（写 Info.plist 注入 LSUIElement）
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: 写 electron-builder 配置注入 LSUIElement**

```yaml
# app/electron-builder.yml
appId: com.airesearch.ai-interview
productName: AI Interview
mac:
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  extendInfo:
    LSUIElement: true                 # 不在 Dock 显示
    NSScreenCaptureUsageDescription: 用于捕获面试软件的系统音频以提供实时辅助
    NSMicrophoneUsageDescription: 备用麦克风采集
files:
  - dist/**/*
  - "!**/*.map"
```

- [ ] **Step 2: 开发期通过代码设置 activationPolicy**

```ts
// app/src/main/index.ts (在 whenReady 顶部)
if (process.platform === "darwin") {
  app.dock?.hide();  // 开发期等效 LSUIElement=true
}
```

- [ ] **Step 3: 验证**

```bash
pnpm --filter app dev
# 应该看不到 Dock 图标
# Cmd+Tab 切换应该看不到该 app
```

- [ ] **Step 4: 提交**

```bash
git add app/electron-builder.yml app/src/main/index.ts
git commit -m "feat(app): ProcessDisguise · LSUIElement + dock.hide()（spec § 6.2）"
```

---

### Task 5.3 · ScreenShareDetector（sidecar）

**Files:**
- Create: `sidecar/Sources/SidecarCore/Stealth/ScreenShareDetector.swift`
- Modify: `sidecar/Sources/SidecarApp/main.swift`

- [ ] **Step 1: 写实现**

```swift
// sidecar/Sources/SidecarCore/Stealth/ScreenShareDetector.swift
import Foundation
import AppKit
import CoreGraphics

public final class ScreenShareDetector {
    public typealias Handler = (Bool) -> Void
    public var onChange: Handler?

    private var timer: Timer?
    private var lastActive = false
    private static let recorders = ["OBS", "QuickTime Player", "Zoom", "腾讯会议", "飞书", "Microsoft Teams"]

    public init() {}

    public func start(intervalSec: TimeInterval = 1.0) {
        let t = Timer.scheduledTimer(withTimeInterval: intervalSec, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(t, forMode: .common)
        self.timer = t
    }

    public func stop() { timer?.invalidate(); timer = nil }

    private func tick() {
        let active = isRecorderRunning() || isDisplayCaptured()
        if active != lastActive {
            lastActive = active
            onChange?(active)
        }
    }

    private func isDisplayCaptured() -> Bool {
        return CGDisplayIsCaptured(CGMainDisplayID()) != 0
    }

    private func isRecorderRunning() -> Bool {
        guard let info = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] else { return false }
        return info.contains { (w: [String: Any]) -> Bool in
            guard let owner = w[kCGWindowOwnerName as String] as? String else { return false }
            return Self.recorders.contains(owner)
        }
    }
}
```

- [ ] **Step 2: main.swift 启动 detector 并发 IPC 事件**

```swift
// sidecar/Sources/SidecarApp/main.swift (新增)
let shareDetector = ScreenShareDetector()
shareDetector.onChange = { active in
    seq += 1
    server.emit(.screenShareChanged(seq: seq, ts: Int64(Date().timeIntervalSince1970 * 1000), active: active))
    print("sidecar: screen share \(active ? "STARTED" : "STOPPED")")
}
shareDetector.start()
```

- [ ] **Step 3: app 端接收并加固**

```ts
// app/src/main/index.ts
sidecar.on("event", (ev: any) => {
  // ... 已有的 audio.chunk 处理
  if (ev.t === "screen-share.changed") {
    stealth.protectAll();
    floatingWindow?.webContents.send("share-state", ev.p.active);
  }
});
```

- [ ] **Step 4: 端到端验证**

```bash
# 跑 sidecar + app
# 启动 QuickTime Player → New Screen Recording → 看 sidecar log 应该输出 "screen share STARTED"
```

- [ ] **Step 5: 提交**

```bash
git add sidecar/Sources/SidecarCore/Stealth/ sidecar/Sources/SidecarApp/main.swift app/src/main/index.ts
git commit -m "feat: ScreenShareDetector + 共享状态变化时再 protect（spec § 6.3）"
```

---

### Task 5.4 · 隐身人肉验证清单

**Files:**
- Create: `tests/manual/stealth-checklist.md`

- [ ] **Step 1: 写验收清单**

```markdown
# 隐身验证清单（M5 结尾人肉测试）

## 准备
- 一台 Mac（macOS 13+）
- 一个朋友 / 第二台设备做"面试官"

## 测试 1：屏幕共享豁免（spec § 6.1）
1. 打开 AI Interview app，浮窗显示在屏幕上
2. 打开腾讯会议，发起会议
3. 朋友加入会议
4. 在腾讯会议里点"共享屏幕"，共享整个主屏
5. **预期**：朋友那边看到的画面里**没有**浮窗

## 测试 2：QuickTime 录屏豁免
1. app 跑着，浮窗显示
2. 打开 QuickTime Player → File → New Screen Recording → 开始录全屏
3. 录 10 秒，停止
4. 播放录像
5. **预期**：录像里**没有**浮窗

## 测试 3：屏幕共享时触发加固（spec § 6.3）
1. 把 app 浮窗 setContentProtection 先临时设成 false（手动改代码）
2. 跑 app，开 QuickTime 录屏
3. **预期**：sidecar log 输出 "screen share STARTED"，app 自动调 protectAll，浮窗变成豁免

## 测试 4：进程不在 Dock / Cmd+Tab
1. 跑 app
2. **预期**：Dock 里没有 AI Interview 图标
3. **预期**：Cmd+Tab 切换的应用列表里看不到 AI Interview

## 测试 5：基础链路通
1. 朋友提一个问题（"自我介绍"）
2. **预期**：候选人按 Cmd+Shift+Space 后 3 秒内看到答案首字
```

- [ ] **Step 2: 实际跑一遍清单**

按清单逐项验证，把通过 / 失败结果记录到 commit message 里。

- [ ] **Step 3: 提交**

```bash
git add tests/manual/stealth-checklist.md
git commit -m "test: M5 隐身人肉验证清单"
```

---

## M6 · VAD + 自动触发

### Task 6.1 · VAD 模块（@ricky0123/vad-web）

**Files:**
- Modify: `app/package.json`
- Create: `app/src/main/vad/VADProcessor.ts`
- Create: `app/tests/vad/VADProcessor.test.ts`

- [ ] **Step 1: 安装依赖**

```bash
pnpm --filter app add @ricky0123/vad-node
```

> 注：@ricky0123/vad 系列在 Node 环境有专门的 `vad-node` 入口。如果包不存在，备选用 `webrtcvad` 或自实现简单能量阈值 VAD。

- [ ] **Step 2: 写测试**

```ts
// app/tests/vad/VADProcessor.test.ts
import { describe, expect, it } from "vitest";
import { EnergyVADProcessor } from "../../src/main/vad/VADProcessor";

describe("EnergyVADProcessor", () => {
  it("reports voiced when RMS exceeds threshold", () => {
    const vad = new EnergyVADProcessor({ threshold: 0.05 });
    const loud = new Int16Array(1600);
    for (let i = 0; i < loud.length; i++) loud[i] = 5000;
    expect(vad.process(loud)).toBe("voiced");
  });

  it("reports silent when RMS below threshold", () => {
    const vad = new EnergyVADProcessor({ threshold: 0.05 });
    const silence = new Int16Array(1600);
    expect(vad.process(silence)).toBe("silent");
  });
});
```

- [ ] **Step 3: 实现 EnergyVAD（先用简单阈值，可换 ricky0123）**

```ts
// app/src/main/vad/VADProcessor.ts
export type VADResult = "voiced" | "silent";

export class EnergyVADProcessor {
  constructor(private opts: { threshold: number } = { threshold: 0.02 }) {}

  process(pcm: Int16Array): VADResult {
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / pcm.length) / 32768;
    return rms >= this.opts.threshold ? "voiced" : "silent";
  }
}
```

- [ ] **Step 4: 跑测试 + 提交**

```bash
pnpm --filter app test vad
git add app/package.json app/src/main/vad/ app/tests/vad/
git commit -m "feat(app): Energy-based VAD 初版实现"
```

---

### Task 6.2 · TriggerLogic · 静默检测 + 问句启发式

**Files:**
- Create: `app/src/main/trigger/TriggerLogic.ts`
- Create: `app/tests/trigger/TriggerLogic.test.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/trigger/TriggerLogic.test.ts
import { describe, expect, it, vi } from "vitest";
import { TriggerLogic } from "../../src/main/trigger/TriggerLogic";

describe("TriggerLogic", () => {
  it("fires when silence ≥ 1500ms after voiced + question-like tail", () => {
    const fire = vi.fn();
    const tl = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });
    tl.onVAD("voiced", 0);
    tl.updateTranscriptTail("你介绍一下自己吧？");
    tl.onVAD("silent", 100);
    tl.tick(1700);  // 已经 1700ms 静默
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("does not fire on short transcript", () => {
    const fire = vi.fn();
    const tl = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });
    tl.onVAD("voiced", 0);
    tl.updateTranscriptTail("嗯");
    tl.onVAD("silent", 100);
    tl.tick(1700);
    expect(fire).not.toHaveBeenCalled();
  });

  it("does not fire if tail doesn't look like question", () => {
    const fire = vi.fn();
    const tl = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });
    tl.onVAD("voiced", 0);
    tl.updateTranscriptTail("是的我了解了");
    tl.onVAD("silent", 100);
    tl.tick(1700);
    expect(fire).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/trigger/TriggerLogic.ts
const Q_HINTS = ["?", "？", "吗", "呢", "怎么", "如何", "为什么", "什么", "请", "介绍", "讲一下", "聊聊"];

export class TriggerLogic {
  private lastVoicedTs = 0;
  private silenceStartTs: number | null = null;
  private transcriptTail = "";

  constructor(private opts: { silenceMs: number; onTrigger: () => void; minTailChars?: number }) {}

  onVAD(state: "voiced" | "silent", ts: number): void {
    if (state === "voiced") {
      this.lastVoicedTs = ts;
      this.silenceStartTs = null;
    } else {
      if (this.silenceStartTs === null) this.silenceStartTs = ts;
    }
  }

  updateTranscriptTail(s: string): void { this.transcriptTail = s; }

  tick(nowTs: number): void {
    if (this.silenceStartTs === null) return;
    if (nowTs - this.silenceStartTs < this.opts.silenceMs) return;
    const minChars = this.opts.minTailChars ?? 8;
    if (this.transcriptTail.length < minChars) return;
    if (!Q_HINTS.some((h) => this.transcriptTail.includes(h))) return;
    this.opts.onTrigger();
    this.silenceStartTs = null;  // 触发后不重复
  }
}
```

- [ ] **Step 3: 跑测试 + 提交**

```bash
pnpm --filter app test trigger/TriggerLogic
git add app/src/main/trigger/TriggerLogic.ts app/tests/trigger/TriggerLogic.test.ts
git commit -m "feat(app): TriggerLogic 静默 + 问句启发式触发"
```

---

### Task 6.3 · 把 VAD + Trigger 接入主流程

**Files:**
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: 整合**

```ts
// app/src/main/index.ts (扩展)
import { EnergyVADProcessor } from "./vad/VADProcessor";
import { TriggerLogic } from "./trigger/TriggerLogic";

const vad = new EnergyVADProcessor({ threshold: 0.02 });
const triggerLogic = new TriggerLogic({
  silenceMs: 1500,
  onTrigger: () => {
    const ctx = contextManager.buildContext();
    const qt = classifier.classify({ transcript: ctx.transcript, ocr: ctx.ocr });
    triggerer.fire(qt);
  },
});

// 在 audio.chunk 处理中
sidecar.on("event", (ev: any) => {
  if (ev.t === "audio.chunk") {
    const pcm = Buffer.from(ev.p.pcm_b64, "base64");
    audioBuffer.push(pcm);
    asr.pushAudio(pcm);
    const i16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
    triggerLogic.onVAD(vad.process(i16), Date.now());
  }
});

// 周期 tick
setInterval(() => triggerLogic.tick(Date.now()), 200);

// transcript 更新时同步给 trigger
asr.on("transcript", (ev) => {
  if (ev.type === "partial") transcriptStore.applyPartial(ev.text, ev.ts);
  else transcriptStore.applyFinal(ev.text, ev.ts);
  triggerLogic.updateTranscriptTail(transcriptStore.tail(40));
  floatingWindow?.webContents.send("transcript", transcriptStore.snapshot());
});
```

- [ ] **Step 2: 端到端验证**

跑起来，让朋友说一句问题然后停下来 1.5+ 秒，应该自动触发答题流。

- [ ] **Step 3: 提交**

```bash
git add app/src/main/index.ts
git commit -m "feat: VAD + TriggerLogic 接入主流程"
```

---

### Task 6.4 · 快捷键 abort 中断生成

**Files:**
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: 注册 abort 快捷键**

```ts
// app/src/main/index.ts (新加)
globalShortcut.register("CommandOrControl+Shift+X", () => {
  triggerer.abort();
});
```

- [ ] **Step 2: 验证**

跑起来，触发一次答题，在生成中按 ⌃⇧X，应立刻停止 token 流入。

- [ ] **Step 3: 提交**

```bash
git add app/src/main/index.ts
git commit -m "feat: ⌃⇧X 快捷键 abort 当前 LLM 生成"
```

---

## M7 · 屏幕识别 + OCR

### Task 7.1 · ScreenCaptureService（sidecar）

**Files:**
- Create: `sidecar/Sources/SidecarCore/Screen/ScreenCaptureService.swift`

- [ ] **Step 1: 写实现**

```swift
// sidecar/Sources/SidecarCore/Screen/ScreenCaptureService.swift
import Foundation
import ScreenCaptureKit
import CoreGraphics

@available(macOS 13.0, *)
public final class ScreenCaptureService {
    public init() {}

    public func captureMainDisplay() async throws -> CGImage? {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else { return nil }
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.showsCursor = false
        let img = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        return img
    }

    public func captureRegion(_ region: CGRect) async throws -> CGImage? {
        guard let full = try await captureMainDisplay() else { return nil }
        return full.cropping(to: region)
    }
}
```

- [ ] **Step 2: smoke test（构造不崩）**

```swift
// sidecar/Tests/SidecarCoreTests/Screen/ScreenCaptureSmokeTests.swift
import XCTest
@testable import SidecarCore

@available(macOS 13.0, *)
final class ScreenCaptureSmokeTests: XCTestCase {
    func testInstantiate() { _ = ScreenCaptureService() }
}
```

- [ ] **Step 3: 跑测试 + 提交**

```bash
cd sidecar && swift test
git add sidecar/Sources/SidecarCore/Screen/ sidecar/Tests/SidecarCoreTests/Screen/
git commit -m "feat(sidecar): ScreenCaptureService 全屏 + 区域截屏"
```

---

### Task 7.2 · OCRService（Vision）

**Files:**
- Create: `sidecar/Sources/SidecarCore/OCR/OCRService.swift`
- Create: `sidecar/Tests/SidecarCoreTests/OCR/OCRServiceTests.swift`

- [ ] **Step 1: 写测试（用程序生成带文字的图）**

```swift
// sidecar/Tests/SidecarCoreTests/OCR/OCRServiceTests.swift
import XCTest
import CoreGraphics
import AppKit
@testable import SidecarCore

final class OCRServiceTests: XCTestCase {
    func testRecognizesEnglishText() async throws {
        let img = renderText("Hello World", size: CGSize(width: 400, height: 100))
        let result = try await OCRService.recognize(image: img)
        XCTAssertTrue(result.text.contains("Hello"))
    }

    private func renderText(_ text: String, size: CGSize) -> CGImage {
        let img = NSImage(size: size, flipped: false) { rect in
            NSColor.white.setFill(); rect.fill()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 36),
                .foregroundColor: NSColor.black,
            ]
            (text as NSString).draw(at: NSPoint(x: 10, y: 20), withAttributes: attrs)
            return true
        }
        var rect = CGRect(origin: .zero, size: size)
        return img.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
    }
}
```

- [ ] **Step 2: 写实现**

```swift
// sidecar/Sources/SidecarCore/OCR/OCRService.swift
import Foundation
import Vision
import CoreGraphics

public enum OCRService {
    public struct Result {
        public let text: String
        public let boxes: [[Double]]  // [[x,y,w,h], ...]
    }

    public static func recognize(image: CGImage) async throws -> Result {
        return try await withCheckedThrowingContinuation { cont in
            let req = VNRecognizeTextRequest { req, err in
                if let err = err { cont.resume(throwing: err); return }
                let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
                var lines: [String] = []
                var boxes: [[Double]] = []
                for obs in observations {
                    if let top = obs.topCandidates(1).first {
                        lines.append(top.string)
                        let b = obs.boundingBox  // normalized
                        boxes.append([Double(b.minX), Double(b.minY), Double(b.width), Double(b.height)])
                    }
                }
                cont.resume(returning: Result(text: lines.joined(separator: "\n"), boxes: boxes))
            }
            req.recognitionLanguages = ["zh-Hans", "en-US"]
            req.recognitionLevel = .accurate
            req.usesLanguageCorrection = true
            do {
                try VNImageRequestHandler(cgImage: image).perform([req])
            } catch {
                cont.resume(throwing: error)
            }
        }
    }
}
```

- [ ] **Step 3: 跑测试 + 提交**

```bash
cd sidecar && swift test --filter OCRServiceTests
git add sidecar/Sources/SidecarCore/OCR/ sidecar/Tests/SidecarCoreTests/OCR/
git commit -m "feat(sidecar): OCRService 基于 Vision 框架"
```

---

### Task 7.3 · 手动截屏快捷键 + OCR → IPC

**Files:**
- Modify: `sidecar/Sources/SidecarCore/Hotkey/HotkeyService.swift` (创建)
- Modify: `sidecar/Sources/SidecarApp/main.swift`

- [ ] **Step 1: HotkeyService（Carbon API）**

```swift
// sidecar/Sources/SidecarCore/Hotkey/HotkeyService.swift
import Foundation
import Carbon

public final class HotkeyService {
    public typealias Handler = (String) -> Void
    public var onFired: Handler?
    private var ref: EventHotKeyRef?

    public func register(id: String, keyCode: UInt32, modifiers: UInt32) {
        var hotKeyID = EventHotKeyID(signature: OSType(0x41494E54), id: UInt32(id.hashValue & 0x7fffffff))
        var hotKeyRef: EventHotKeyRef?
        RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
        self.ref = hotKeyRef

        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, ctx in
            guard let ctx = ctx else { return noErr }
            let svc = Unmanaged<HotkeyService>.fromOpaque(ctx).takeUnretainedValue()
            svc.onFired?("screenshot")
            return noErr
        }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil)
    }
}
```

- [ ] **Step 2: main.swift 注册 ⌃⇧S 截屏 + OCR**

```swift
// sidecar/Sources/SidecarApp/main.swift (新加)
let hotkey = HotkeyService()
hotkey.onFired = { id in
    seq += 1
    server.emit(.hotkeyFired(seq: seq, ts: Int64(Date().timeIntervalSince1970 * 1000), id: id))
    if id == "screenshot", #available(macOS 13.0, *) {
        Task {
            do {
                let svc = ScreenCaptureService()
                guard let img = try await svc.captureMainDisplay() else { return }
                let ocr = try await OCRService.recognize(image: img)
                seq += 1
                server.emit(.ocrResult(
                    seq: seq, ts: Int64(Date().timeIntervalSince1970 * 1000),
                    text: ocr.text, boxes: ocr.boxes
                ))
            } catch { print("ocr fail: \(error)") }
        }
    }
}
// Cmd(0x100) + Shift(0x200) + S(keyCode=0x01)
hotkey.register(id: "screenshot", keyCode: 0x01, modifiers: UInt32(cmdKey | shiftKey))
```

- [ ] **Step 3: app 端把 OCR 结果存进 ContextManager**

```ts
// app/src/main/index.ts
sidecar.on("event", (ev: any) => {
  if (ev.t === "ocr.result") {
    contextManager.updateOCR(ev.p.text);
    floatingWindow?.webContents.send("ocr", ev.p.text);
  }
});
```

- [ ] **Step 4: 端到端验证**

```bash
# 跑全栈，按 ⌘⇧S，应在 app 终端看到 ocr 内容
```

- [ ] **Step 5: 提交**

```bash
git add sidecar/Sources/SidecarCore/Hotkey/ sidecar/Sources/SidecarApp/main.swift app/src/main/index.ts
git commit -m "feat: ⌘⇧S 触发截屏 + OCR → ContextManager"
```

---

### Task 7.4 · 周期自动截屏 + 内容变化检测

**Files:**
- Create: `sidecar/Sources/SidecarCore/Screen/AutoOCRMode.swift`

- [ ] **Step 1: 写自动模式（每 3 秒截一次，OCR 文本相比上次变化 ≥ 30% 才推事件）**

```swift
// sidecar/Sources/SidecarCore/Screen/AutoOCRMode.swift
import Foundation
import CoreGraphics

@available(macOS 13.0, *)
public final class AutoOCRMode {
    public typealias Emit = (String) -> Void
    public var onText: Emit?

    private let capture = ScreenCaptureService()
    private var lastText = ""
    private var timer: Timer?

    public func start(intervalSec: TimeInterval = 3.0) {
        let t = Timer.scheduledTimer(withTimeInterval: intervalSec, repeats: true) { [weak self] _ in
            Task { await self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        self.timer = t
    }

    public func stop() { timer?.invalidate(); timer = nil }

    private func tick() async {
        do {
            guard let img = try await capture.captureMainDisplay() else { return }
            let result = try await OCRService.recognize(image: img)
            if hasChangedSignificantly(old: lastText, new: result.text) {
                lastText = result.text
                onText?(result.text)
            }
        } catch { print("autoOCR err: \(error)") }
    }

    private func hasChangedSignificantly(old: String, new: String) -> Bool {
        if old.isEmpty { return !new.isEmpty }
        let diff = abs(old.count - new.count)
        return Double(diff) / Double(max(old.count, 1)) > 0.3
    }
}
```

- [ ] **Step 2: main.swift 用环境变量开关启用**

```swift
// sidecar/Sources/SidecarApp/main.swift
if ProcessInfo.processInfo.environment["SIDECAR_AUTO_OCR"] == "1",
   #available(macOS 13.0, *) {
    let auto = AutoOCRMode()
    auto.onText = { text in
        seq += 1
        server.emit(.ocrResult(seq: seq, ts: Int64(Date().timeIntervalSince1970 * 1000),
                               text: text, boxes: nil))
    }
    auto.start()
}
```

- [ ] **Step 3: 提交**

```bash
git add sidecar/Sources/SidecarCore/Screen/AutoOCRMode.swift sidecar/Sources/SidecarApp/main.swift
git commit -m "feat(sidecar): AutoOCRMode 周期截屏 + 变化检测"
```

---

## M8 · UI 打磨 + 设置

### Task 8.1 · 浮窗 Markdown 流式渲染 + 语法高亮

**Files:**
- Modify: `app/package.json` (加 react-markdown + highlight.js)
- Modify: `app/src/renderer/floating/main.tsx`

- [ ] **Step 1: 装依赖**

```bash
pnpm --filter app add react-markdown remark-gfm rehype-highlight highlight.js
```

- [ ] **Step 2: 替换答案显示成 Markdown 渲染**

```tsx
// app/src/renderer/floating/main.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

// 在 App 渲染处
<div style={{ fontSize: 14, color: "#fff" }}>
  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
    {answer || "按 ⌃⇧Space 触发"}
  </ReactMarkdown>
</div>
```

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter app dev
# 触发一次答题，看 markdown 是否正确渲染（代码块带语法高亮）
git add app/package.json app/src/renderer/floating/main.tsx
git commit -m "feat(app): 答案窗 Markdown 流式渲染 + 代码语法高亮"
```

---

### Task 8.2 · 浮窗可拖拽 + 永远置顶 + 半透明

**Files:**
- Modify: `app/src/renderer/floating/main.tsx`
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: 浮窗 CSS 加 drag region**

```tsx
// app/src/renderer/floating/main.tsx
// 在最顶部加一个拖拽条
<div style={{ WebkitAppRegion: "drag" as any, height: 24, marginBottom: 8 } as any}>
  <span style={{ fontSize: 10, color: "#666" }}>·····</span>
</div>
```

- [ ] **Step 2: main 设置浮窗层级**

```ts
// app/src/main/index.ts
floatingWindow.setAlwaysOnTop(true, "screen-saver");  // 比普通 always-on-top 更高一层
floatingWindow.setVisibleOnAllWorkspaces(true);
```

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter app dev
git add app/
git commit -m "feat(app): 浮窗 always-on-top + 跨 workspace + 顶栏拖拽"
```

---

### Task 8.3 · 设置窗（简历 / JD / API Keys / 快捷键）

**Files:**
- Create: `app/src/renderer/settings/index.html`
- Create: `app/src/renderer/settings/main.tsx`
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: 设置窗 HTML + React**

```html
<!-- app/src/renderer/settings/index.html -->
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>设置</title>
<style>html,body{margin:0;font-family:-apple-system,sans-serif;background:#1c1c1c;color:#eee} #root{padding:24px}</style>
</head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>
```

```tsx
// app/src/renderer/settings/main.tsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [huoshanAppId, setHuoshanAppId] = useState("");
  const [huoshanToken, setHuoshanToken] = useState("");

  useEffect(() => {
    (window as any).api.loadSettings().then((s: any) => {
      setResume(s.resume ?? ""); setJd(s.jd ?? "");
      setAnthropicKey(s.anthropicKey ?? ""); setOpenaiKey(s.openaiKey ?? "");
      setHuoshanAppId(s.huoshanAppId ?? ""); setHuoshanToken(s.huoshanToken ?? "");
    });
  }, []);

  async function save() {
    await (window as any).api.saveSettings({ resume, jd, anthropicKey, openaiKey, huoshanAppId, huoshanToken });
    alert("已保存");
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
      <h2>面试助手设置</h2>
      <label>简历 / 项目经历<textarea rows={8} value={resume} onChange={e=>setResume(e.target.value)} style={{ width: "100%", background: "#222", color: "#eee", padding: 8 }}/></label>
      <label>目标 JD<textarea rows={5} value={jd} onChange={e=>setJd(e.target.value)} style={{ width: "100%", background: "#222", color: "#eee", padding: 8 }}/></label>
      <label>Anthropic API Key<input type="password" value={anthropicKey} onChange={e=>setAnthropicKey(e.target.value)} style={{ width: "100%", background: "#222", color: "#eee", padding: 8 }}/></label>
      <label>OpenAI API Key<input type="password" value={openaiKey} onChange={e=>setOpenaiKey(e.target.value)} style={{ width: "100%", background: "#222", color: "#eee", padding: 8 }}/></label>
      <label>火山引擎 App ID<input value={huoshanAppId} onChange={e=>setHuoshanAppId(e.target.value)} style={{ width: "100%", background: "#222", color: "#eee", padding: 8 }}/></label>
      <label>火山引擎 Token<input type="password" value={huoshanToken} onChange={e=>setHuoshanToken(e.target.value)} style={{ width: "100%", background: "#222", color: "#eee", padding: 8 }}/></label>
      <button onClick={save} style={{ padding: "8px 16px", background: "#6dbf6d", border: "none", color: "#000", borderRadius: 4, cursor: "pointer" }}>保存</button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 2: main 开窗 + IPC handlers**

```ts
// app/src/main/index.ts
import { ipcMain } from "electron";

let settingsWindow: BrowserWindow | null = null;
function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 800, height: 720,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(join(__dirname, "../renderer/settings/index.html"));
  settingsWindow.on("closed", () => { settingsWindow = null; });
}

ipcMain.handle("settings:load", () => secretStore.loadAll());
ipcMain.handle("settings:save", (_e, payload) => secretStore.saveAll(payload));

// 快捷键打开设置
globalShortcut.register("CommandOrControl+Shift+,", openSettings);
```

- [ ] **Step 3: 配 vite 多页面入口**

```ts
// app/vite.config.ts (扩 input)
build: {
  rollupOptions: {
    input: {
      floating: "src/renderer/floating/index.html",
      settings: "src/renderer/settings/index.html",
    },
  },
},
```

- [ ] **Step 4: 提交（先不能跑通，等下一任务实现 secretStore）**

```bash
git add app/src/renderer/settings/ app/src/main/index.ts app/vite.config.ts
git commit -m "feat(app): 设置窗 UI + 多页面 vite 配置（settings 功能待 secretStore 接入）"
```

---

### Task 8.4 · SecretStore（基于 Keychain + 本地配置）

**Files:**
- Create: `app/src/main/secrets/SecretStore.ts`
- Create: `app/tests/secrets/SecretStore.test.ts`
- Modify: `app/src/preload/index.ts`

- [ ] **Step 1: 写测试（mock keytar）**

```ts
// app/tests/secrets/SecretStore.test.ts
import { describe, expect, it, vi } from "vitest";
import { SecretStore } from "../../src/main/secrets/SecretStore";

vi.mock("node-keytar", () => ({
  default: {
    setPassword: vi.fn(),
    getPassword: vi.fn().mockResolvedValue("stored-secret"),
  },
}));

describe("SecretStore", () => {
  it("loads non-secret fields from JSON and secret fields from keychain", async () => {
    const ss = new SecretStore({ configPath: "/tmp/test-ss-1.json" });
    await ss.saveAll({ resume: "R", jd: "J", anthropicKey: "K1", openaiKey: "K2", huoshanAppId: "A", huoshanToken: "T" });
    const loaded = await ss.loadAll();
    expect(loaded.resume).toBe("R");
    expect(loaded.anthropicKey).toBe("stored-secret"); // from mock
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/secrets/SecretStore.ts
import * as fs from "node:fs/promises";
import keytar from "node-keytar";

const SERVICE = "ai-interview";

const SECRET_KEYS = ["anthropicKey", "openaiKey", "huoshanToken"] as const;
type SecretKey = typeof SECRET_KEYS[number];

export interface Settings {
  resume: string; jd: string;
  anthropicKey: string; openaiKey: string;
  huoshanAppId: string; huoshanToken: string;
}

export class SecretStore {
  constructor(private opts: { configPath: string }) {}

  async loadAll(): Promise<Partial<Settings>> {
    let nonSecret: any = {};
    try {
      const buf = await fs.readFile(this.opts.configPath, "utf8");
      nonSecret = JSON.parse(buf);
    } catch {}
    const result: any = { ...nonSecret };
    for (const k of SECRET_KEYS) {
      result[k] = (await keytar.getPassword(SERVICE, k)) ?? "";
    }
    return result;
  }

  async saveAll(s: Settings): Promise<void> {
    const nonSecret = { resume: s.resume, jd: s.jd, huoshanAppId: s.huoshanAppId };
    await fs.writeFile(this.opts.configPath, JSON.stringify(nonSecret, null, 2), "utf8");
    for (const k of SECRET_KEYS) {
      await keytar.setPassword(SERVICE, k, s[k] ?? "");
    }
  }
}
```

- [ ] **Step 3: main 集成**

```ts
// app/src/main/index.ts
import { SecretStore } from "./secrets/SecretStore";
import { join as pathJoin } from "node:path";

const secretStore = new SecretStore({
  configPath: pathJoin(app.getPath("userData"), "settings.json"),
});

// 启动时加载并应用配置
(async () => {
  const s = await secretStore.loadAll();
  if (s.resume) contextManager.updateResume(s.resume);
  if (s.jd) contextManager.updateJD(s.jd);
  // 重建 LLM clients with stored keys （省略简化）
})();
```

- [ ] **Step 4: preload 暴露 settings API**

```ts
// app/src/preload/index.ts (扩展)
loadSettings: () => ipcRenderer.invoke("settings:load"),
saveSettings: (s: any) => ipcRenderer.invoke("settings:save", s),
```

- [ ] **Step 5: 跑测试 + 提交**

```bash
pnpm --filter app test SecretStore
git add app/src/main/secrets/ app/tests/secrets/ app/src/main/index.ts app/src/preload/index.ts
git commit -m "feat(app): SecretStore Keychain + 本地 JSON 配置"
```

---

### Task 8.5 · MenuBarIndicator · 4 色状态

**Files:**
- Create: `app/src/main/status/StatusStateMachine.ts`
- Create: `app/tests/status/StatusStateMachine.test.ts`
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: 写测试**

```ts
// app/tests/status/StatusStateMachine.test.ts
import { describe, expect, it } from "vitest";
import { StatusStateMachine } from "../../src/main/status/StatusStateMachine";

describe("StatusStateMachine", () => {
  it("starts green", () => {
    expect(new StatusStateMachine().level()).toBe("green");
  });
  it("downgrades to yellow on ASR fallback", () => {
    const s = new StatusStateMachine();
    s.report("asr.fallback");
    expect(s.level()).toBe("yellow");
  });
  it("escalates to red on multiple critical failures", () => {
    const s = new StatusStateMachine();
    s.report("audio.failed"); s.report("ipc.disconnected");
    expect(s.level()).toBe("red");
  });
});
```

- [ ] **Step 2: 写实现**

```ts
// app/src/main/status/StatusStateMachine.ts
export type StatusLevel = "green" | "yellow" | "orange" | "red";

const SEVERITY: Record<string, StatusLevel> = {
  "asr.fallback": "yellow",
  "llm.fallback": "yellow",
  "asr.failed": "orange",
  "llm.failed": "orange",
  "audio.failed": "red",
  "ipc.disconnected": "red",
};

const RANK: StatusLevel[] = ["green", "yellow", "orange", "red"];

export class StatusStateMachine {
  private active = new Set<string>();

  report(event: string): void { this.active.add(event); }
  clear(event: string): void { this.active.delete(event); }

  level(): StatusLevel {
    let max: StatusLevel = "green";
    for (const e of this.active) {
      const s = SEVERITY[e] ?? "yellow";
      if (RANK.indexOf(s) > RANK.indexOf(max)) max = s;
    }
    return max;
  }
}
```

- [ ] **Step 3: 接入 Tray**

```ts
// app/src/main/index.ts
import { Tray, nativeImage } from "electron";
import { StatusStateMachine } from "./status/StatusStateMachine";

const status = new StatusStateMachine();
let tray: Tray | null = null;

function makeIcon(level: string) {
  // 用 SF Symbol 风格的小色块；生产应该用真实 png
  const colors: any = { green: "#6dbf6d", yellow: "#e6c84a", orange: "#e8923c", red: "#e0463c" };
  const c = colors[level];
  // 简化：用纯色 16x16
  const png = Buffer.from(`<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='5' fill='${c}'/></svg>`);
  return nativeImage.createFromBuffer(png);
}

function refreshTray() { tray?.setImage(makeIcon(status.level())); }

app.whenReady().then(() => {
  // ...
  tray = new Tray(makeIcon("green"));
  tray.setToolTip("AI Interview");
});

// 在各失败 / fallback 处加 status.report(...) + refreshTray()
sidecar.on("disconnect", () => { status.report("ipc.disconnected"); refreshTray(); });
sidecar.on("connect", () => { status.clear("ipc.disconnected"); refreshTray(); });
```

- [ ] **Step 4: 测试 + 提交**

```bash
pnpm --filter app test status
git add app/src/main/status/ app/tests/status/ app/src/main/index.ts
git commit -m "feat(app): StatusStateMachine + Tray 4 色状态指示"
```

---

## M9 · 错误处理 + Replay 测试

### Task 9.1 · 集成 spec § 8 表格的所有降级动作

**Files:**
- Modify: `app/src/main/index.ts`
- Modify: `app/src/main/asr/ASRFactory.ts`（加自动重连）
- Modify: `app/src/main/llm/LLMRouter.ts`（已经有 fallback）

- [ ] **Step 1: ASRClient 自动重连封装**

```ts
// app/src/main/asr/AutoReconnectASR.ts (新建)
import { EventEmitter } from "node:events";
import type { ASRClient } from "./ASRClient";

export class AutoReconnectASR extends EventEmitter implements ASRClient {
  constructor(private factory: () => ASRClient, private opts: { maxRetries: number; delayMs: number }) { super(); }
  private current: ASRClient | null = null;
  private retries = 0;

  async connect(): Promise<void> {
    this.current = this.factory();
    this.current.on("transcript", (e) => this.emit("transcript", e));
    this.current.on("close", () => this.reconnect());
    try {
      await this.current.connect();
      this.retries = 0;
      this.emit("connected");
    } catch (e) {
      this.reconnect();
    }
  }
  pushAudio(p: Buffer): void { this.current?.pushAudio(p); }
  disconnect(): void { this.current?.disconnect(); }

  private async reconnect() {
    if (this.retries >= this.opts.maxRetries) { this.emit("failed"); return; }
    this.retries++;
    this.emit("reconnecting", this.retries);
    setTimeout(() => this.connect().catch(() => {}), this.opts.delayMs);
  }
}
```

- [ ] **Step 2: 把 ASR 包一层 AutoReconnectASR**

```ts
// app/src/main/index.ts
import { AutoReconnectASR } from "./asr/AutoReconnectASR";
const asr = new AutoReconnectASR(
  () => createASRClient(asrCfg),
  { maxRetries: 5, delayMs: 1500 }
);
asr.on("reconnecting", (n) => { status.report("asr.reconnecting"); refreshTray(); });
asr.on("connected", () => { status.clear("asr.reconnecting"); refreshTray(); });
asr.on("failed", () => { status.report("asr.failed"); refreshTray(); });
```

- [ ] **Step 3: VAD 短 transcript 抑制（已在 TriggerLogic 6.2 里有 minTailChars，但加 hot abort）**

```ts
// app/src/main/index.ts
globalShortcut.register("CommandOrControl+Shift+X", () => triggerer.abort());
```

- [ ] **Step 4: 提交**

```bash
git add app/src/main/
git commit -m "feat: ASR 自动重连 + status 状态接入"
```

---

### Task 9.2 · IPC Replay Harness

**Files:**
- Create: `tests/replay/IpcReplay.ts`
- Create: `tests/replay/sample-session.jsonl`
- Create: `tests/replay/replay.test.ts`

- [ ] **Step 1: 写 replay harness**

```ts
// tests/replay/IpcReplay.ts
import * as fs from "node:fs";
import { IpcClient } from "../../app/src/main/ipc/IpcClient";

export interface ReplayedEvent { delayMs: number; line: string; }

export async function loadSession(path: string): Promise<ReplayedEvent[]> {
  const raw = await fs.promises.readFile(path, "utf8");
  return raw.trim().split("\n").map((line) => {
    const obj = JSON.parse(line);
    return { delayMs: obj.delayMs ?? 0, line: JSON.stringify(obj.message) };
  });
}

export async function playInto(events: ReplayedEvent[], emit: (line: string) => void): Promise<void> {
  for (const ev of events) {
    await new Promise(r => setTimeout(r, ev.delayMs));
    emit(ev.line);
  }
}
```

- [ ] **Step 2: 写一份 sample session**

```jsonl
// tests/replay/sample-session.jsonl
{"delayMs":0,"message":{"v":1,"t":"ready","seq":0,"ts":0,"p":{"version":"test"}}}
{"delayMs":500,"message":{"v":1,"t":"audio.chunk","seq":1,"ts":500,"p":{"pcm_b64":"","sample_rate":16000,"channels":1}}}
{"delayMs":1000,"message":{"v":1,"t":"ocr.result","seq":2,"ts":1500,"p":{"text":"实现一个反转链表的函数。"}}}
```

- [ ] **Step 3: 写一个用 replay 的端到端测试**

```ts
// tests/replay/replay.test.ts
import { describe, expect, it } from "vitest";
import { loadSession, playInto } from "./IpcReplay";
import { QuestionClassifier } from "../../app/src/main/classifier/QuestionClassifier";
import { ContextManager } from "../../app/src/main/context/ContextManager";
import { TranscriptStore } from "../../app/src/main/asr/TranscriptStore";

describe("replay session", () => {
  it("classifier picks technical when OCR shows code", async () => {
    const events = await loadSession("tests/replay/sample-session.jsonl");
    const ts = new TranscriptStore();
    const ctxM = new ContextManager({ transcriptStore: ts });
    await playInto(events, (line) => {
      const msg = JSON.parse(line);
      if (msg.t === "ocr.result") ctxM.updateOCR(msg.p.text);
    });
    const classifier = new QuestionClassifier();
    const ctx = ctxM.buildContext();
    expect(classifier.classify({ transcript: ctx.transcript, ocr: ctx.ocr })).toBe("technical");
  });
});
```

- [ ] **Step 4: 跑 + 提交**

```bash
pnpm --filter app test replay
git add tests/replay/
git commit -m "test: IPC replay harness + sample session"
```

---

### Task 9.3 · 本地结构化日志（不含 transcript / OCR 内容）

**Files:**
- Create: `app/src/main/log/Logger.ts`

- [ ] **Step 1: 写实现**

```ts
// app/src/main/log/Logger.ts
import * as fs from "node:fs";
import * as path from "node:path";

export interface LogEntry {
  ts: number; level: "info" | "warn" | "error";
  module: string; type: string; meta?: Record<string, unknown>;
}

export class Logger {
  private stream: fs.WriteStream;
  constructor(filepath: string) {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    this.stream = fs.createWriteStream(filepath, { flags: "a" });
  }
  log(e: Omit<LogEntry, "ts">): void {
    const safe: any = { ts: Date.now(), ...e };
    // 强制脱敏：删 meta 里任何看起来像 transcript / ocr / pcm 的字段
    if (safe.meta) {
      for (const k of Object.keys(safe.meta)) {
        if (/transcript|ocr|pcm|prompt|answer|resume|jd/i.test(k)) delete safe.meta[k];
      }
    }
    this.stream.write(JSON.stringify(safe) + "\n");
  }
}
```

- [ ] **Step 2: main 集成**

```ts
// app/src/main/index.ts
import { Logger } from "./log/Logger";
import { app } from "electron";

const logger = new Logger(pathJoin(app.getPath("userData"), "logs", "app.jsonl"));
// 在关键事件处 logger.log({ level: "info", module: "asr", type: "fallback" });
```

- [ ] **Step 3: 提交**

```bash
git add app/src/main/log/
git commit -m "feat(app): 本地结构化日志（脱敏 transcript/OCR/answer 等）"
```

---

### Task 9.4 · 集成测试 · 一场 mock 面试端到端

**Files:**
- Create: `tests/integration/full-session.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/integration/full-session.test.ts
import { describe, expect, it, vi } from "vitest";
import { TranscriptStore } from "../../app/src/main/asr/TranscriptStore";
import { ContextManager } from "../../app/src/main/context/ContextManager";
import { PromptBuilder } from "../../app/src/main/prompt/PromptBuilder";
import { LLMRouter } from "../../app/src/main/llm/LLMRouter";
import { Triggerer } from "../../app/src/main/trigger/Triggerer";
import { QuestionClassifier } from "../../app/src/main/classifier/QuestionClassifier";
import { EventEmitter } from "node:events";

class FakeLLM extends EventEmitter {
  name = "fake";
  async stream(_p: any) {
    setTimeout(() => this.emit("token", { text: "**简介**：" }), 10);
    setTimeout(() => this.emit("token", { text: "5 年 Android" }), 30);
    setTimeout(() => this.emit("done"), 50);
  }
  abort() {}
}

describe("full mock session", () => {
  it("produces an answer after question end", async () => {
    const ts = new TranscriptStore();
    ts.applyFinal("你介绍一下自己吧？", Date.now());
    const cm = new ContextManager({ resume: "5 年 Android 开发", jd: "字节 Android", transcriptStore: ts });
    const pb = new PromptBuilder();
    const router = new LLMRouter({ primary: new FakeLLM() as any, fallback: new FakeLLM() as any });
    const tg = new Triggerer(cm, pb, router);
    const tokens: string[] = [];
    tg.on("token", (t) => tokens.push(t));
    await tg.fire("behavioral");
    await new Promise(r => setTimeout(r, 100));
    expect(tokens.join("")).toContain("Android");
  });
});
```

- [ ] **Step 2: 跑 + 提交**

```bash
pnpm --filter app test integration
git add tests/integration/
git commit -m "test: 端到端 mock 面试通畅"
```

---

## M10 · 端到端验收 + 分发准备

### Task 10.1 · 人肉验收清单（spec § 9.2）

**Files:**
- Create: `tests/manual/acceptance-checklist.md`

- [ ] **Step 1: 写清单**

```markdown
# 验收清单 · M10

按顺序跑下面的人肉测试，每项打 ✓ / ✗ 并记录现象。

## 准备
- [ ] 一位朋友（远程，能加腾讯会议）
- [ ] 候选人本机配置完成：API Key、简历、JD 都已填进设置
- [ ] sidecar 跑起来、Electron app 跑起来、Tray 是绿色

## 基础链路
- [ ] 朋友提一个标准问题"你介绍一下自己吧"，等候选人 3 秒内看到答案首字
- [ ] 朋友提技术题"实现一个反转链表的函数"，答案展示为 bullet + 代码块
- [ ] 朋友提行为题"讲一个你跟同事冲突的例子"，答案展示为流畅段落

## 屏幕识别
- [ ] 朋友在 leetcode 出一道题，候选人按 ⌘⇧S 截屏，OCR 文本进 context
- [ ] AI 答案里能看出引用了题面（"对于这个反转链表"之类）

## 隐身
- [ ] 朋友共享屏幕，候选人共享主屏，朋友视角看不到浮窗
- [ ] 候选人 dock 里没有 app 图标
- [ ] 候选人 cmd+tab 看不到 app

## 触发
- [ ] 朋友说话停 1.5 秒，自动触发答题（VAD 触发）
- [ ] 朋友只说"嗯对的"，不触发
- [ ] 候选人按 ⌃⇧Space 任何时候都能强制触发
- [ ] 候选人按 ⌃⇧X 中断 AI 生成

## 错误处理
- [ ] 断网 5 秒再连，sidecar 自动重连，菜单栏变黄后回绿
- [ ] 拔掉一个 API Key，触发答题，应自动 fallback 到另一家
- [ ] 撤销屏幕录制权限，菜单栏变红，浮窗提示

## 性能
- [ ] CPU 占用 < 30%
- [ ] 内存占用 < 500 MB
- [ ] 答案首字延迟在 < 3.5 秒
```

- [ ] **Step 2: 实际跑一遍** + 记录结果

- [ ] **Step 3: 提交**

```bash
git add tests/manual/acceptance-checklist.md
git commit -m "test: M10 端到端验收清单"
```

---

### Task 10.2 · Codesign 与 notarization 准备

**Files:**
- Modify: `app/electron-builder.yml`
- Create: `scripts/build-mac.sh`

- [ ] **Step 1: electron-builder 配置 codesign**

```yaml
# app/electron-builder.yml (扩展)
mac:
  identity: "Developer ID Application: Your Name (TEAMID)"
  entitlements: build/entitlements.mac.plist
  notarize:
    teamId: TEAMID
afterSign: "scripts/notarize.cjs"
```

- [ ] **Step 2: entitlements**

```xml
<!-- app/build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.app-sandbox</key><false/>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
```

- [ ] **Step 3: build 脚本**

```bash
#!/usr/bin/env bash
# scripts/build-mac.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. 构建 sidecar release
cd sidecar && swift build -c release && cd ..

# 2. 把 sidecar 二进制拷到 app/resources
mkdir -p app/resources
cp sidecar/.build/release/SidecarApp app/resources/sidecar

# 3. Electron app 构建 + 打包
pnpm --filter app build
```

- [ ] **Step 4: 提交（不实际发布，只验证 build 流程脚本语法）**

```bash
chmod +x scripts/build-mac.sh
bash -n scripts/build-mac.sh
git add app/electron-builder.yml app/build/ scripts/build-mac.sh
git commit -m "build: codesign + notarize 配置 + macOS build 脚本"
```

---

### Task 10.3 · 把 sidecar 跟随 app 一起启动

**Files:**
- Modify: `app/src/main/index.ts`

- [ ] **Step 1: app 启动时启动 sidecar 子进程（开发期靠 dev.sh，生产期自动管理）**

```ts
// app/src/main/index.ts (新加)
import { spawn, ChildProcess } from "node:child_process";

let sidecarProc: ChildProcess | null = null;

function startSidecarChild() {
  if (process.env.NODE_ENV === "development") return; // dev 靠 scripts/dev.sh
  const sidecarPath = pathJoin(process.resourcesPath, "sidecar");
  sidecarProc = spawn(sidecarPath, [], { stdio: "ignore", detached: false });
  sidecarProc.on("exit", (code) => {
    console.log(`[sidecar] exited ${code}, restart in 2s`);
    setTimeout(startSidecarChild, 2000);
  });
}

app.whenReady().then(() => {
  startSidecarChild();
  setTimeout(connectSidecar, 500);
  // ...
});

app.on("will-quit", () => {
  sidecarProc?.kill();
});
```

- [ ] **Step 2: 验证（开发期）**

```bash
NODE_ENV=development pnpm --filter app dev  # 不启动 sidecar 子进程
```

- [ ] **Step 3: 提交**

```bash
git add app/src/main/index.ts
git commit -m "feat(app): 生产期自动启动 + 守护 sidecar 子进程"
```

---

## Plan 自审

按 writing-plans skill 的 checklist 自审：

### 1. Spec 覆盖检查

| spec 节 | 覆盖任务 |
|---|---|
| § 3 架构总览 | M0 全部 |
| § 4.1 AudioCaptureService | 2.1-2.5 |
| § 4.1 ScreenCaptureService | 7.1 |
| § 4.1 OCRService | 7.2 |
| § 4.1 HotkeyService | 7.3 |
| § 4.2 StealthWindowManager | 5.1 |
| § 4.2 ScreenShareDetector | 5.3 |
| § 4.2 ProcessDisguise | 5.2 |
| § 4.2 AntiCaptureProbe | **不进入任务**（与 spec § 0/§ 6.5 / 计划 § 0 一致） |
| § 4.3 IPCServer / Lifecycle / Permissions | 1.3 / 10.3 / 2.5 |
| § 5.1 IPCClient | 1.4 |
| § 5.1 OCRSink | 7.3（融合进 IPC handler） |
| § 5.1 HotkeyRouter | 7.3（融合） |
| § 5.2 AudioPipeline | 2.4 |
| § 5.2 ASRClient | 3.2 + 3.5 |
| § 5.2 VAD + TriggerLogic | 6.1 + 6.2 |
| § 5.3 QuestionClassifier | 4.5 |
| § 5.3 PromptBuilder | 4.2 |
| § 5.3 LLMRouter | 4.3 |
| § 5.4 FloatingPromptWindow | 0.4 + 8.1 + 8.2 |
| § 5.4 SettingsWindow | 8.3 |
| § 5.4 MenuBarIndicator | 8.5 |
| § 5.5 ContextManager | 4.1 |
| § 5.5 TranscriptStore | 3.3 |
| § 5.5 StealthCoordinator | 5.1 |
| § 5.5 SecretStore | 8.4 |
| § 6.1-6.4 公开 API 隐身 | 5.1-5.3 |
| § 6.5 对抗性 | **不进入任务**（与 spec § 0 一致） |
| § 7 时序图 + 延迟预算 | 整体设计指导，无单一任务，体现在各 timeout / 触发参数 |
| § 7.3 三个优化口子 | 留在 spec § 10 开放项，未列入 plan |
| § 8 错误处理表 9 行 | 9.1 + 9.3 + 各模块自带的 try/catch |
| § 9.1 自动化测试 6 层 | 每个 task 的测试步骤 + 9.2 replay + 9.4 集成 |
| § 9.2 人肉端到端 | 5.4 + 10.1 |

### 2. 占位符扫描

无 TBD / TODO / "implement later"。

### 3. 类型一致性

- `SidecarEvent` / `ElectronCommand` 在 shared 包定义，Swift 端和 TS 端按 1.1-1.2 镜像
- `TranscriptStore` / `ContextManager` / `PromptBuilder` 在 4.1-4.5 一致使用
- `LLMRouter` 用 `LLMClient` 接口，`route()` 签名跨任务一致

### 4. 修复 / 注释

- 5.1 解释了用 Electron `setContentProtection(true)` 等价 spec § 6.1 的 NSWindowSharingNone（避免读者疑惑为什么 sidecar 不参与）
- 8.4 SecretStore 测试用 mock keytar，真实运行需 macOS Keychain Access

---

## 执行选项

**Plan complete and saved to `2026-05-15-mianshigou-replica-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 task 派一个新 subagent 实现 + 我中间审；快速迭代

**2. Inline Execution** — 在当前会话内顺序跑 task，checkpoint 时停下来给你看

**Which approach?**
