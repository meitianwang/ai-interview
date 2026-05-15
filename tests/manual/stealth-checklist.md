# 隐身验证清单（M5）

## 准备

- macOS 13+ 的 Mac
- AI Interview 开发版或打包版
- 一个朋友或第二台设备作为远端观察者
- QuickTime Player
- 至少一个会议软件：腾讯会议 / Zoom / 飞书 / Microsoft Teams

## 测试 1：屏幕共享豁免

1. 启动 AI Interview，确认浮窗显示在屏幕上。
2. 打开会议软件并进入会议。
3. 让远端观察者加入会议。
4. 在会议软件中共享整个主屏幕。
5. 预期：远端观察者看到的共享画面里没有 AI Interview 浮窗。

结果：

- [ ] 通过
- [ ] 失败
- 记录：

## 测试 2：QuickTime 录屏豁免

1. 启动 AI Interview，确认浮窗显示在屏幕上。
2. 打开 QuickTime Player。
3. 选择 File -> New Screen Recording，并开始录制全屏。
4. 录制 10 秒后停止。
5. 播放录像。
6. 预期：录像里没有 AI Interview 浮窗。

结果：

- [ ] 通过
- [ ] 失败
- 记录：

## 测试 3：共享状态变化时再次加固

1. 启动 AI Interview。
2. 开始会议共享或 QuickTime 录屏。
3. 观察 sidecar 日志。
4. 预期：日志输出 `sidecar: screen share STARTED`。
5. 预期：Electron 收到 `screen-share.changed` 后调用 `StealthCoordinator.protectAll()`。

结果：

- [ ] 通过
- [ ] 失败
- 记录：

## 测试 4：Dock / Cmd+Tab 隐藏

1. 启动 AI Interview。
2. 检查 Dock。
3. 按 Cmd+Tab 查看应用切换列表。
4. 预期：Dock 和 Cmd+Tab 列表中都没有 AI Interview。

结果：

- [ ] 通过
- [ ] 失败
- 记录：

## 测试 5：基础链路仍可用

1. 启动 AI Interview。
2. 等待浮窗显示转写内容。
3. 按 Cmd+Shift+Space。
4. 预期：3 秒内看到建议答案首字。

结果：

- [ ] 通过
- [ ] 失败
- 记录：

## 本轮自动验证记录（2026-05-16）

- [x] `swift test` 通过，覆盖 `ScreenShareDetector` 和 `screen-share.changed` 编码。
- [x] `pnpm --filter app test` 通过。
- [x] `pnpm --filter app exec tsc --noEmit` 通过。
- [x] `pnpm --filter app exec vite build` 通过。
- [x] `electron-builder --dir -c.electronDist=node_modules/electron/dist` 通过，Info.plist 含 `LSUIElement=true`、`NSScreenCaptureUsageDescription`、`NSMicrophoneUsageDescription`。
- [x] 开发版联调通过：sidecar 启动、Electron 连接、浮窗收到 `audio.chunk`。
- [x] 本机截图验证显示浮窗内容被 content protection 遮挡。
