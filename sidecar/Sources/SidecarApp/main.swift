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
signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)

let interruptSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
let terminateSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let shutdown = {
    server.stop()
    exit(0)
}
interruptSource.setEventHandler(handler: shutdown)
terminateSource.setEventHandler(handler: shutdown)
interruptSource.resume()
terminateSource.resume()

server.onCommand = { (command: ElectronCommand) in
    switch command {
    case .ping(let seq, _, let token):
        logLine("sidecar got ping seq=\(seq) token=\(token)")
    default:
        logLine("sidecar got cmd: \(command)")
    }
}

try server.start()
logLine("sidecar listening on \(path)")
RunLoop.main.run()
