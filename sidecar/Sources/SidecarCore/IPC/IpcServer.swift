import Foundation
import Network

public final class IpcServer {
    public typealias CommandHandler = (ElectronCommand) -> Void

    private let socketPath: String
    private let queue: DispatchQueue
    private let queueKey = DispatchSpecificKey<Void>()
    private var listener: NWListener?
    private var clients: [NWConnection] = []
    private var buffers: [ObjectIdentifier: String] = [:]
    private var nextSeq = 0
    private let maxBufferedBytes = 64 * 1024

    public var onCommand: CommandHandler?

    public init(socketPath: String, queue: DispatchQueue = DispatchQueue(label: "ai-interview.ipc-server")) {
        self.socketPath = socketPath
        self.queue = queue
        self.queue.setSpecific(key: queueKey, value: ())
    }

    public func start() throws {
        try? FileManager.default.removeItem(atPath: socketPath)

        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .unix(path: socketPath)
        parameters.allowLocalEndpointReuse = true

        let listener = try NWListener(using: parameters)
        listener.stateUpdateHandler = { [socketPath] state in
            if case .ready = state {
                chmod(socketPath, 0o600)
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    public func stop() {
        let cleanup = {
            self.listener?.cancel()
            self.listener = nil
            self.clients.forEach { $0.cancel() }
            self.clients.removeAll()
            self.buffers.removeAll()
            try? FileManager.default.removeItem(atPath: self.socketPath)
        }

        if DispatchQueue.getSpecific(key: queueKey) != nil {
            cleanup()
        } else {
            queue.sync(execute: cleanup)
        }
    }

    public func emit(_ event: SidecarEvent) {
        guard let data = try? IpcCodec.encode(event) else {
            return
        }

        queue.async { [weak self] in
            guard let self else {
                return
            }

            self.clients.forEach { connection in
                connection.send(content: data, completion: .contentProcessed { _ in })
            }
        }
    }

    private func accept(_ connection: NWConnection) {
        clients.append(connection)
        connection.start(queue: queue)

        let event = SidecarEvent.ready(
            seq: nextReadySeq(),
            ts: Int64(Date().timeIntervalSince1970 * 1000),
            version: IpcProtocol.version
        )
        if let data = try? IpcCodec.encode(event) {
            connection.send(content: data, completion: .contentProcessed { _ in })
        }

        readLoop(connection)
    }

    private func nextReadySeq() -> Int {
        let seq = nextSeq
        nextSeq += 1
        return seq
    }

    private func readLoop(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, _ in
            guard let self else {
                return
            }

            if let data, !data.isEmpty {
                self.consume(data, from: connection)
            }

            if isComplete {
                self.remove(connection)
                return
            }

            self.readLoop(connection)
        }
    }

    private func consume(_ data: Data, from connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        var buffer = buffers[id] ?? ""
        buffer += String(data: data, encoding: .utf8) ?? ""

        if buffer.utf8.count > maxBufferedBytes {
            buffer = String(buffer.suffix(maxBufferedBytes))
        }

        while let newline = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newline])
            buffer = String(buffer[buffer.index(after: newline)...])
            guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                continue
            }
            if let command = try? IpcCodec.decodeCommand(line) {
                onCommand?(command)
            }
        }

        buffers[id] = buffer
    }

    private func remove(_ connection: NWConnection) {
        clients.removeAll { $0 === connection }
        buffers[ObjectIdentifier(connection)] = nil
    }
}
