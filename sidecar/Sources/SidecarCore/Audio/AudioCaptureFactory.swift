import Foundation

public enum AudioCaptureMode: Equatable {
    case automatic
    case mock
    case screenCaptureKit
}

public enum AudioCaptureFactory {
    public static func mode(from environment: [String: String]) -> AudioCaptureMode {
        switch environment["SIDECAR_AUDIO_PROVIDER"]?.lowercased() {
        case "mock":
            return .mock
        case "sck", "screencapturekit":
            return .screenCaptureKit
        default:
            return .automatic
        }
    }

    public static func make(
        mode: AudioCaptureMode,
        chunkIntervalMs: Int = 100
    ) -> AudioCaptureService {
        switch mode {
        case .mock:
            return MockAudioCaptureService(chunkIntervalMs: chunkIntervalMs)
        case .screenCaptureKit, .automatic:
            guard #available(macOS 13.0, *) else {
                return MockAudioCaptureService(chunkIntervalMs: chunkIntervalMs)
            }

            return FallbackAudioCaptureService(
                primary: SCKAudioCaptureService(),
                fallback: MockAudioCaptureService(chunkIntervalMs: chunkIntervalMs)
            )
        }
    }

    public static func make(
        environment: [String: String],
        chunkIntervalMs: Int = 100
    ) -> AudioCaptureService {
        make(mode: mode(from: environment), chunkIntervalMs: chunkIntervalMs)
    }
}

public final class FallbackAudioCaptureService: AudioCaptureService {
    public var onChunk: ((Data, Int64) -> Void)? {
        didSet {
            primary.onChunk = onChunk
            fallback.onChunk = onChunk
        }
    }

    private let primary: AudioCaptureService
    private let fallback: AudioCaptureService
    private var active: AudioCaptureService?

    public init(primary: AudioCaptureService, fallback: AudioCaptureService) {
        self.primary = primary
        self.fallback = fallback
    }

    public func start() throws {
        primary.onChunk = onChunk
        do {
            try primary.start()
            active = primary
        } catch {
            primary.stop()
            fallback.onChunk = onChunk
            try fallback.start()
            active = fallback
        }
    }

    public func stop() {
        active?.stop()
        if active !== primary {
            primary.stop()
        }
        if active !== fallback {
            fallback.stop()
        }
        active = nil
    }
}
