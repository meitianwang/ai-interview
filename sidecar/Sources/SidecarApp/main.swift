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
private var screenShareSequence = 0
signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)

let interruptSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
let terminateSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let shutdown = {
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
    screenShareSequence += 1
    server.emit(.screenShareChanged(
        seq: screenShareSequence,
        ts: Int64(Date().timeIntervalSince1970 * 1000),
        active: active
    ))
    logLine("sidecar: screen share \(active ? "STARTED" : "STOPPED")")
}

try server.start()
logLine("sidecar listening on \(path)")
shareDetector.start()
RunLoop.main.run()

private final class CaptureBridge {
    private let server: IpcServer
    private let captureService: AudioCaptureService
    private let queue = DispatchQueue(label: "ai-interview.capture-bridge")
    private var sequence = 0

    init(server: IpcServer) {
        self.server = server
        self.captureService = MockAudioCaptureService(chunkIntervalMs: 100)
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
