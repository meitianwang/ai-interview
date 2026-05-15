# 面试狗类产品复刻 · 设计文档

- **日期**：2026-05-15
- **状态**：Design (待 writing-plans 接力)
- **文档性质**：防御方研究 / 反作弊设计前置拆解

---

## 0 · 文档边界声明

本文档是**防御方研究**输出，目的是把"实时面试 AI 助手"这类产品的攻击面拆透，为反作弊产品设计提供基础。**不会被实际 ship 成可供候选人使用的作弊工具**。

文档的写作深度按以下边界把握：

| 范围 | 深度 |
|---|---|
| 公开 Apple API 能实现的能力（屏幕共享豁免、进程隐身用户态、录屏检测、显示器分离等） | 写出 **Swift 代码片段 + API 调用**。这些技术在 1Password / 微信 / 银行 app 也用，是公开技术 |
| ASR / LLM / Electron / VAD 等基础设施 | 写到**可指导实施**的深度 |
| 对抗具体某款监考软件（Proctorio / 鹰眼 / 网易监考宝 等）的绕过 | **不写**。只写技术**类别 + 原理**。具体绕过对防御研究本身没增量价值（防御不靠逐个产品对抗，靠分类对抗） |

---

## 1 · 项目背景

本项目对标的产品类别：**实时面试 AI 助手**（典型代表：面试狗 / 面试鸭 / Cluely / Pickle）。核心场景是远程视频面试中，候选人本机软件实时监听面试官音频，AI 在本机另一区域弹出答题提示，并对面试官屏幕共享隐身。

复刻目的是**理解攻击面**：

- 知道攻击者能做到什么 → 才能设计有效的反作弊检测
- 知道攻击者**做不到**什么（如 user-space 截屏豁免对抗）→ 才能定位防御应该往哪个层去（如摄像头侧拍 / 多模态联合）

---

## 2 · 锁定范围

需求经多轮澄清后锁定如下：

| 维度 | 选择 |
|---|---|
| 场景 | 远程视频面试 · 候选人本机 |
| 部署形态 | 桌面客户端 |
| 目标 OS / 框架 | **macOS 优先** · Electron + Swift sidecar |
| 面试类型覆盖 | 技术面 + 行为面全覆盖 |
| 隐身能力档位 | **D 级**（含反 OBS / 反 AI 监考类别讨论） |
| 事前上下文 | 候选人侧（简历 + 项目经历）+ 岗位侧（目标公司 + JD） |
| 屏幕识别 | 手动截图 + 持续自动检测 + 知名站点（LeetCode / 牛客等）特化 |
| AI 推理栈 | ASR 国产流式（火山 / 阿里） · LLM Claude + OpenAI 路由 |
| 触发模式 | VAD 静默检测 + 快捷键覆盖 |
| 展示形态 | 题型自适应 —— 技术题用 3-bullet 大纲，行为题用流式长文 |
| 语种 | 纯中文 |
| 业务范围 | 仅做实时面试助手（不含模拟器 / 题库 / 复盘） |
| AI 形态 | **单次流式 LLM 调用**（不上 agent，延迟物理上限制） |

---

## 3 · 架构总览

两个进程，本地 Unix Domain Socket 通讯。

```
┌──────────────────────────────────────────────────────────────────┐
│  macOS · 候选人本机                                                │
│                                                                  │
│  ┌──────────────────┐    UDS / JSONL    ┌──────────────────────┐ │
│  │  Swift Sidecar   │ ◄──────────────► │  Electron App        │ │
│  │  (背景守护)       │                   │  (UI + 业务编排)      │ │
│  └──────────────────┘                   └──────────────────────┘ │
│         ▲ ▲                                       │              │
│      系统音频 / 屏幕像素                            │              │
└─────────│─│───────────────────────────────────────│──────────────┘
          │ │                                       │
   Zoom/腾讯会议 桌面客户端       ASR (国产) · LLM (Claude / OpenAI)
   候选人系统音频
```

**边界划分原则**：

- 所有需要 Apple 原生 API 的能力（音频捕获、屏幕捕获、隐身窗口、全局快捷键、Vision OCR）→ Swift sidecar
- UI / 业务逻辑 / 网络调用 → Electron
- IPC 只走两类消息：sidecar 推**事件流**（audio chunk / OCR / hotkey / 屏幕共享状态），Electron 推**指令**（启停采集 / 截屏请求 / 窗口隐身）
- **网络只在 Electron 侧打开**：所有云端 API 调用从 Electron 出去，sidecar 不联网
- **OCR 在本地完成**（Apple Vision），截屏内容不离开候选人电脑

### 为什么不选纯 Electron 一体化

- Node native addon 维护痛苦（每个 Electron 版本重编、macOS SDK 跟进慢）
- Node event loop 跑实时音频流有 jitter
- 隐身相关 NSWindow API 在 Electron BrowserWindow 上要 hack 才能干净做透

### 为什么不选纯 Swift / SwiftUI

- 跨平台路径完全堵死（虽然当前 MVP 只做 macOS，但未来可扩展性归零）
- UI 迭代慢、组件生态小

---

## 4 · Swift Sidecar 模块

按职责分三组：感知 / 隐身 / 通讯。

### 4.1 感知 (Sensing)

#### AudioCaptureService
- **API**：`ScreenCaptureKit · SCStream`（macOS 13+）
- **输出**：16 kHz 单声道 PCM 流，100ms 一帧
- **关键点**：使用 ScreenCaptureKit 的"系统音频"过滤器，无需安装虚拟声卡（BlackHole / Soundflower 等），用户体验从"需装驱动"降到"勾权限就行"

```swift
let config = SCStreamConfiguration()
config.capturesAudio = true
config.excludesCurrentProcessAudio = true
config.sampleRate = 16000
config.channelCount = 1

let stream = SCStream(filter: filter, configuration: config, delegate: self)
try await stream.startCapture()

// AudioOutputDelegate
func stream(_: SCStream, didOutputSampleBuffer buf: CMSampleBuffer, of: SCStreamOutputType) {
    let pcm = extractPCM(buf)
    ipc.send(.audioChunk(pcm, ts: buf.presentationTimeStamp))
}
```

#### ScreenCaptureService
- **API**：`ScreenCaptureKit · SCScreenshotManager`
- **输出**：按需截屏（手动快捷键 / 周期自动），可指定区域

#### OCRService
- **API**：`Vision · VNRecognizeTextRequest`
- **输出**：文本 + bounding boxes
- **关键点**：本机 OCR，中英双语，毫秒级。截屏内容**不外发**

```swift
let request = VNRecognizeTextRequest { req, _ in
    let lines = (req.results as? [VNRecognizedTextObservation])?
        .compactMap { $0.topCandidates(1).first?.string } ?? []
    ipc.send(.ocrResult(lines.joined(separator: "\n"), boxes: ...))
}
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.recognitionLevel = .accurate
try VNImageRequestHandler(cgImage: img).perform([request])
```

#### HotkeyService
- **API**：`Carbon · RegisterEventHotKey`
- **作用**：全局快捷键（触发 AI / 隐藏窗口 / 截屏 / 重答 / 终止）

### 4.2 隐身 (Stealth)

详见 § 6 D 级隐身技术拆解。本组中**真正会落地为代码模块**的有 3 个：

- StealthWindowManager（控制 Electron 窗口 sharingType）
- ScreenShareDetector（监听本机录屏 / 共享状态）
- ProcessDisguise（LSUIElement / activationPolicy / Bundle Name）

§ 6.5 讨论的"对抗具体监考软件 / 对抗外部录屏 / 对抗行为指纹检测"**不作为模块落地**，仅作为防御研究的技术类别分析存在。

### 4.3 通讯 (IPC)

#### IPCServer
- **API**：Unix Domain Socket，行分隔 JSON 协议（JSONL）
- **绑定**：`~/Library/Application Support/<app>/sidecar.sock`，权限 0600
- **不监听网络端口**

#### Lifecycle
- 作为 LaunchAgent（`~/Library/LaunchAgents/com.<vendor>.<app>.sidecar.plist`）跟随用户 session 启动
- Electron 启动时先 ping sidecar，没起来就 launchctl 拉起

#### Permissions
- 首次启动引导用户授予：
  - 屏幕录制（音频也走这个权限，TCC `kTCCServiceScreenCapture`）
  - 辅助功能（用于全局快捷键 / Accessibility，TCC `kTCCServiceAccessibility`）
  - 麦克风（备选，如系统音频失败时降级用）

---

## 5 · Electron App 模块

按数据流向分四层，加横跨的状态/存储/协调。

### 5.1 ① 输入层

- **IPCClient**：UDS 客户端，接 sidecar 推来的事件，转发指令
- **OCRSink**：订阅 `ocr.result`，进 ContextManager
- **HotkeyRouter**：订阅 `hotkey.fired`，转成业务动作

### 5.2 ② 实时流层

- **AudioPipeline**：拼帧、电平归一化，转发到 ASRClient
- **ASRClient**：流式 ASR 长连接（WebSocket），PCM 进 / partial transcript 出
- **VAD + TriggerLogic**：WebRTC VAD（wasm）判面试官静默，组合"末尾像问句"启发式触发

```ts
// 触发判定核心
if (silenceMs >= 1500
    && looksLikeQuestion(transcript.tail) // "?" / "对吧" / "怎么" / "如何"
    && !llmRouter.isGenerating()
    && transcript.tail.length >= 8) {
  trigger()
}
hotkeyRouter.on('fire', () => { llmRouter.abort(); trigger() })
```

### 5.3 ③ AI 编排层

- **QuestionClassifier**：把 trigger 时的 transcript 段 + 最新 OCR 题面分类成"技术题 / 行为题 / 闲聊"。用规则 + 小模型混合（规则命中直出，未命中走 LLM 兜底）
- **PromptBuilder**：按题型选模板，注入候选人简历 + JD + 最近 30s transcript + 最新 OCR 题面 + 历史 QA 摘要
- **LLMRouter**：题型 → 模型映射：
  - 算法题 / 代码题 → Claude（reasoning + 代码质量稳）
  - 系统设计 / 八股 → 任一，按延迟选
  - 行为题 → OpenAI（中文行为题文风更"职业"）
  - 任一失败 → 自动 fallback 到另一家

```ts
async function route(promptCtx: PromptContext): Promise<ReadableStream> {
  const primary = pickPrimary(promptCtx.questionType, settings)
  try {
    return await callLLM(primary, promptCtx, { timeoutMs: 8000 })
  } catch (e) {
    log.warn('primary failed, falling back', e)
    return await callLLM(fallbackOf(primary), promptCtx, { timeoutMs: 8000 })
  }
}
```

### 5.4 ④ UI 层

- **FloatingPromptWindow**：主答案窗（无边框、半透明、置顶、可拖拽、sharingType=none）
- **SettingsWindow**：简历/JD/目标公司/API Key/快捷键/隐身策略/模型偏好
- **MenuBarIndicator**：Tray 图标，状态 4 色（绿/黄/橙/红），或彻底隐藏

### 5.5 ⑤ 横跨 · 状态 / 存储 / 协调

- **ContextManager**：统一管简历、JD、transcript、OCR、历史 QA。对外 API：`buildContext(window: TimeWindow): Context`
- **TranscriptStore**：滚动窗口，最近 N 分钟，带时间戳，可被 OCR 文本对齐
- **StealthCoordinator**：启动时给所有窗口发 set-stealth；订阅 `screen-share.changed` 自动加固
- **SecretStore**：API Key 走 macOS Keychain（`node-keytar`），不写明文配置文件

---

## 6 · D 级隐身技术 · 5 类拆解

按"公开 API 写实现 / 对抗性写分类原理"两档处理。

### 6.1 ① 屏幕共享豁免（公开 API · 写实现）

Apple 官方"截屏豁免"标志位。1Password / 微信 / 银行 app 都用。

```swift
window.sharingType = .none  // NSWindowSharingType
// 等价 ObjC: [window setSharingType:NSWindowSharingNone];
```

**工作原理**：macOS 截屏 API（CGWindowList / ScreenCaptureKit）在收集像素时跳过 `sharingType=none` 的窗口。系统层硬阻断，对所有走 user-space 截屏 API 的进程一视同仁。

Electron 侧通过 native addon 调用 NSWindow API 设置，或由 Swift sidecar 通过 Accessibility 操作 Electron 窗口。

### 6.2 ② 进程隐身 · 用户态（公开 API · 写实现）

不出现在 Dock、不被 Cmd+Tab 切换到、菜单栏不显示 app 名。

```xml
<!-- Info.plist -->
<key>LSUIElement</key>
<true/>
<key>CFBundleName</key>
<string>NoteApp</string>
```

```swift
// 运行时
NSApp.setActivationPolicy(.accessory)  // 不进入正常 app 列表
```

**深度边界**：只骗用户级可见性（Dock / Cmd+Tab / 菜单栏）。`proc_listallpids` + codesign 检查仍然能看到。Bundle Name 改造在 Mac App Store 不允许（违反"清晰标识"要求），分发只能走自签 + notarize 走自己网站。

### 6.3 ③ 录屏 / 共享状态检测（公开 API · 写实现）

```swift
// 检测主屏是否被独占捕获
let isCaptured = CGDisplayIsCaptured(CGMainDisplayID())

// 找已知录屏器 / 会议软件进程
let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as! [[String: Any]]
let recorders = ["OBS", "QuickTime Player", "Zoom", "腾讯会议", "飞书"]
for win in windows {
    if let owner = win[kCGWindowOwnerName as String] as? String,
       recorders.contains(owner) {
        // ...
    }
}

// 订阅屏幕配置变化
NotificationCenter.default.addObserver(
    forName: NSApplication.didChangeScreenParametersNotification, ...)
```

**对称性原理**：进程 A 开始录屏 → macOS 把状态登记到系统级 → 进程 B 可以查询。**这是双向能力**，没有哪个进程能"看到所有进程而不被其他进程看到"——这是 user-space 的根本限制，监考软件用完全相同的 API 反向也能用。

### 6.4 ④ 显示器分离（公开 API · 写实现）

把提示窗口放在没被共享的副屏上。

```swift
let secondary = NSScreen.screens.first { $0 != NSScreen.main }
if let s = secondary {
    window.setFrame(s.visibleFrame, display: true)
}

// 进阶：检测当前被共享的是哪块屏，自动迁移到没被共享的屏
// 通过 CGDisplayStream 的 destination display 信息识别
```

### 6.5 ⑤ 对抗外部录屏 / 对抗 AI 监考（类别 + 原理 · 不写针对具体产品的绕过）

#### 5a · 对抗外部录屏器
OBS / QuickTime / 其它通用录屏器在 macOS 也走 ScreenCaptureKit，默认就被 § 6.1 的 `sharingType=.none` 挡住。

要"绕"过这条防线，攻击侧需要走 kernel-level 抓帧；而 macOS notarization + SIP 让 kext 几乎不可用，DriverKit 沙盒严格。所以**这一子类在 user-space 接近终态**——不需要特殊代码，§ 6.1 已经覆盖。

#### 5b · 对抗进程检测
攻击侧的技术类别（不写实现）：
- 动态库注入到合法进程（dylib injection）
- 伪造进程元数据
- 寄宿在 shell pipe 或合法 Apple 签名进程里

本质上是反 EDR / rootkit 领域的对抗，与杀毒 / 终端检测响应同源。

#### 5c · 对抗行为指纹（监考 AI 看眼神 / 打字节奏 / 答题质量梯度）
攻击侧的技术类别（不写实现）：
- 模拟"思考停顿"
- 答案故意拆段输出
- 加入符合人类节奏的延迟
- Accessibility 注入"自然"的打字模式

本质上是反 ML 检测的对抗样本生成方向。

---

## 7 · 端到端数据流 + 延迟预算

### 7.1 时序

```
时间 →     0s     1s     2s     3s     4s     5s     6s     7s     8s

面试官:    ████ 提问中（约 5 秒）████████████ ───── 静默 ──────────────
Sidecar:   ░░audio chunks (100ms/帧) ░░░░░░░░ ─────────────
ASR:        ░part░ ░part░ ░part░ ░part░ ░part░ final ──
VAD:                                                ⏸ 等静默 1.5s ──
Classifier:                                                       ▓
PromptBuilder:                                                      ▓
LLM:                                                                ░ TTFT 1s ░ streaming ───────
UI:                                                                            ▓ 首字 ▓ 持续渲染
候选人:                                                                          读 → 开口答题
```

### 7.2 关键路径延迟 ≈ 2.85 秒

| 阶段 | 耗时 | 性质 |
|---|---|---|
| VAD 等待静默 | 1500ms | 准确率代价，强约束 |
| QuestionClassifier | 300ms | 可压到 100ms（规则命中 + 缓存） |
| PromptBuilder | 50ms | 本地字符串拼接 |
| LLM TTFT | 1000ms | 网络 + 推理首字 |
| **合计** | **≈ 2850ms** | 静默到首字 |

### 7.3 可优化口子

1. **Prompt 提前构建**：ASR partial 来一段就开始 build，省 50ms
2. **Speculative LLM 调用**：partial 末尾出现问句标志时，VAD 还没满 1.5s 就先发请求；如果 final 改写则 abort 重发。最优情况能把 1500ms VAD 等待与 LLM TTFT 部分重叠
3. **Classifier 合并到 LLM**：让 Claude/OpenAI 在 prompt 开头先输出题型 tag 再输出答案。省 300ms 分类调用，但答案首字推迟（trade-off，需 A/B 决定）

### 7.4 独立链 · 屏幕 OCR

OCR 路径**独立于关键路径**，常驻异步运行：

```
ScreenCaptureService (周期截屏) → OCRService (Vision) → IPC → OCRSink → ContextManager
```

OCR 结果直接更新 ContextManager。下一次 PromptBuilder 调用时自动捎带最新题面。

---

## 8 · 错误处理 + 降级策略

### 8.1 主要失败点

| # | 失败点 | 现象 | 降级动作 |
|---|---|---|---|
| 1 | TCC 屏幕录制权限被撤 | 音频/截屏全挂 | 菜单栏闪红 → 一键引导到系统设置 |
| 2 | ScreenCaptureKit 临时报错 | 单次失败 | 指数退避重试 3 次（100ms / 500ms / 2s）→ 仍失败降级到麦克风 |
| 3 | IPC 断开（任一进程崩） | UDS 连接中断 | 1s 内自动重连 + last seq 拉补；崩溃方由 launchd 自动拉起 |
| 4 | ASR WebSocket 断 | partial 不来 | 主供应商 → 备供应商热切（audio 缓冲 1s 内续传）；都失败 → 切手动输入模式 |
| 5 | LLM 调用失败 / 超时 | 答案出不来 | Claude ↔ OpenAI 自动 fallback；超时阈值 8s |
| 6 | LLM quota / 余额耗尽 | 接口 429/402 | 菜单栏黄 + 弹小卡片，**不打断面试**，可切本地模型 / 备用 Key |
| 7 | VAD 误触发 | LLM 被打断在闲聊上 | hotkey "abort" 一秒内取消；规则补丁：transcript < 8 字不触发 |
| 8 | OCR 识别质量差 | 题面乱码 | PromptBuilder 检查 OCR 可信度 < 0.7 时不注入题面 |
| 9 | 屏幕共享状态漏报 | 候选人开始共享时隐身未生效 | **fail-safe**：目标窗口默认 `sharingType=.none`，不依赖事件触发 |

### 8.2 关键原则

1. **永不弹模态对话框** — 错误走菜单栏小图标颜色 + 可选 toast
2. **状态机 4 色**：绿（正常）/ 黄（降级运行）/ 橙（局部失败）/ 红（核心失效）
3. **fail-safe 默认值** — 隐身相关属性默认开启而非默认关闭。错误情况最多是"候选人看不到答案"，绝不会"暴露给面试官"
4. **本地日志结构化** — JSONL，含模块 + 错误类型，**不含 transcript / OCR 内容**（隐私）

---

## 9 · 测试策略

### 9.1 自动化（开发期 + CI）

| 层 | 测试内容 | 工具 |
|---|---|---|
| Swift Sidecar 单元 | 音频捕获、OCR、IPC 协议序列化 | XCTest |
| Electron 业务单元 | VAD / Trigger / Classifier / PromptBuilder / LLMRouter 规则 | Vitest |
| ASR 客户端 | 录制 30s PCM + 期望 transcript fixture，mock ASR 服务回放 | 录制 fixture |
| LLM Router | mock Claude/OpenAI 返回，测 fallback / 超时 / abort | nock |
| **端到端 replay** | 录一场真实面试 IPC 流（JSONL），在测试环境从 IPC 层灌入，断言 PromptBuilder 输入、LLMRouter 调用、UI 渲染序列 | 自建 replay harness |
| 隐身行为 | 设置 sharingType 后真用 CGWindowList 截屏自己 assertion 抓不到 | XCTest |

**核心实践**：维护一份**权威 fixture**（一场完整面试的 IPC 流 + 期望答案）。任何 prompt / 模型变更都用它做 diff 对比。这是这类产品做不做得稳的分水岭。

### 9.2 人肉端到端（验收 + 重大改动后）

| 场景 | 怎么做 |
|---|---|
| 基础链路通 | 朋友开腾讯会议 / 飞书会议，自己作候选人，朋友提 5 个预设问题，看 UI 是否在 3s 内出答案 |
| 隐身验证 | 朋友共享屏幕给自己看 → 面试官那一侧应**看不到答案窗** |
| 录屏对抗 | 自己开 OBS / QuickTime 录屏，答案窗在录屏里也应消失 |
| 题型自适应 | 混合提技术题（要 bullet）和行为题（要长文），看展示形态切换 |
| 抗噪 | 朋友戴破耳机 / 用麦克风 / 环境嘈杂时跑，看 ASR + VAD 是否还正常 |

### 9.3 两条腿的分工

- **自动化** → catch 回归（"上周改了 prompt，今天突然把技术题答成长文了"）
- **人肉** → catch "对的逻辑做出错的产品"（如答案 3s 内出但太啰嗦候选人来不及念）

人肉每次大改一轮，自动化跑在 pre-commit / CI。

---

## 10 · 后续步骤

本设计文档完成后，进入 `writing-plans` 阶段，把 § 4-9 拆解成可执行的实施计划（按依赖顺序、按模块、带验收标准的任务流）。

### 已知的开放项 / 假设

- ASR 国产供应商**具体选型**（火山 / 阿里 / 讯飞）需要 PoC 对比中文实时 ASR 在面试场景的端点检测准确率，延后到实施 § 5.2 时决定
- QuestionClassifier 的**规则集**初版会比较粗，需要在 replay fixture 上 tune
- § 5.3 的 LLMRouter **题型 → 模型映射规则**（算法题 → Claude、行为题 → OpenAI）是经验假设，需要在 replay fixture 上 A/B 验证后才能定型；初版可直接全走 Claude 或全走 OpenAI 跑通链路
- Speculative LLM 调用的**触发阈值**（"末尾像问句"的判定）需要在实测面试样本上拟合
- D 级隐身 § 6.5 的对抗性技术**仅作分类讨论**，不会进入实际编码

---

*文档版本 v1.0 · 2026-05-15*
