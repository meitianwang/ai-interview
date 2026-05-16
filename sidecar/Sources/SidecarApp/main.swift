import Carbon
import Darwin
import Foundation
import SidecarCore

func logLine(_ message: String) {
    FileHandle.standardOutput.write(Data((message + "\n").utf8))
}

let path = NSHomeDirectory() + "/Library/Application Support/ai-interview/sidecar.sock"
try? FileManager.default.createDirectory(
    atPath: (path as NSString).deletingLastPathComponent,
    withIntermediateDirectories: true,
    attributes: nil
)

let server = IpcServer(socketPath: path)
private let captureBridge = CaptureBridge(server: server)
private let shareDetector = ScreenShareDetector()
private let hotkey = HotkeyService()
private let eventSequencer = EventSequencer()
private var autoOCR: AutoOCRMode?
signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)

let interruptSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
let terminateSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let shutdown = {
    hotkey.unregisterAll()
    autoOCR?.stop()
    shareDetector.stop()
    captureBridge.stop()
    server.stop()
    exit(0)
}
interruptSource.setEventHandler(handler: shutdown)
terminateSource.setEventHandler(handler: shutdown)
interruptSource.resume()
terminateSource.resume()

server.onCommand = { (command: ElectronCommand) in
    switch command {
    case .captureStart:
        captureBridge.start()
        logLine("sidecar capture started")
    case .captureStop:
        captureBridge.stop()
        logLine("sidecar capture stopped")
    case .ping(let seq, _, let token):
        logLine("sidecar got ping seq=\(seq) token=\(token)")
    default:
        logLine("sidecar got cmd: \(command)")
    }
}

shareDetector.onChange = { active in
    server.emit(.screenShareChanged(
        seq: eventSequencer.next(),
        ts: Int64(Date().timeIntervalSince1970 * 1000),
        active: active
    ))
    logLine("sidecar: screen share \(active ? "STARTED" : "STOPPED")")
}

hotkey.onFired = { id in
    server.emit(.hotkeyFired(
        seq: eventSequencer.next(),
        ts: Int64(Date().timeIntervalSince1970 * 1000),
        id: id
    ))

    guard id == "screenshot" else {
        return
    }

    Task {
        do {
            guard #available(macOS 13.0, *) else {
                return
            }

            let capture = ScreenCaptureService()
            guard let image = try await capture.captureMainDisplay() else {
                return
            }

            let ocr = try await OCRService.recognize(image: image)
            server.emit(.ocrResult(
                seq: eventSequencer.next(),
                ts: Int64(Date().timeIntervalSince1970 * 1000),
                text: ocr.text,
                boxes: ocr.boxes
            ))
            logLine("sidecar: ocr \(ocr.text.count) chars")
        } catch {
            logLine("sidecar: ocr fail \(error)")
        }
    }
}

try server.start()
logLine("sidecar listening on \(path)")
shareDetector.start()
do {
    try hotkey.register(id: "screenshot", keyCode: 0x01, modifiers: UInt32(cmdKey | shiftKey))
    logLine("sidecar hotkey registered: screenshot")
} catch {
    logLine("sidecar hotkey register failed: \(error)")
}
if ProcessInfo.processInfo.environment["SIDECAR_AUTO_OCR"] == "1", #available(macOS 13.0, *) {
    let auto = AutoOCRMode()
    auto.onText = { text in
        server.emit(.ocrResult(
            seq: eventSequencer.next(),
            ts: Int64(Date().timeIntervalSince1970 * 1000),
            text: text,
            boxes: nil
        ))
        logLine("sidecar: auto ocr \(text.count) chars")
    }
    auto.start()
    autoOCR = auto
    logLine("sidecar auto OCR enabled")
}
RunLoop.main.run()

private final class CaptureBridge {
    private let server: IpcServer
    private let captureService: AudioCaptureService
    private let queue = DispatchQueue(label: "ai-interview.capture-bridge")
    private var sequence = 0

    init(server: IpcServer) {
        self.server = server
        self.captureService = AudioCaptureFactory.make(
            environment: ProcessInfo.processInfo.environment,
            chunkIntervalMs: 100
        )
        self.captureService.onChunk = { [weak self] pcm, ts in
            self?.emitAudioChunk(pcm: pcm, ts: ts)
        }
    }

    func start() {
        queue.async { [captureService] in
            try? captureService.start()
        }
    }

    func stop() {
        queue.async { [captureService] in
            captureService.stop()
        }
    }

    private func emitAudioChunk(pcm: Data, ts: Int64) {
        queue.async { [server] in
            self.sequence += 1
            server.emit(.audioChunk(seq: self.sequence, ts: ts, pcmBase64: pcm.base64EncodedString()))
        }
    }
}

private final class EventSequencer {
    private let queue = DispatchQueue(label: "ai-interview.sidecar-event-sequencer")
    private var sequence = 0

    func next() -> Int {
        queue.sync {
            sequence += 1
            return sequence
        }
    }
}
