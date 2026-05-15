import Foundation

public final class MockAudioCaptureService: AudioCaptureService {
    public var onChunk: ((Data, Int64) -> Void)?

    private let chunkIntervalMs: Int
    private var timer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "ai-interview.mock-audio")

    public init(chunkIntervalMs: Int = 100) {
        self.chunkIntervalMs = chunkIntervalMs
    }

    public func start() throws {
        stop()

        let timer = DispatchSource.makeTimerSource(queue: queue)
        let interval = DispatchTimeInterval.milliseconds(chunkIntervalMs)
        timer.schedule(deadline: .now() + interval, repeating: interval)
        timer.setEventHandler { [weak self] in
            guard let self else {
                return
            }

            let sampleCount = 16 * self.chunkIntervalMs
            let pcm = Data(count: sampleCount * 2)
            self.onChunk?(pcm, Int64(Date().timeIntervalSince1970 * 1000))
        }
        timer.resume()
        self.timer = timer
    }

    public func stop() {
        timer?.cancel()
        timer = nil
    }
}
