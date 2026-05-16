import Foundation

public enum AudioCaptureMode: Equatable {
    case automatic
    case screenCaptureKit
}

public enum AudioCaptureFactory {
    public static func mode(from environment: [String: String]) -> AudioCaptureMode {
        switch environment["SIDECAR_AUDIO_PROVIDER"]?.lowercased() {
        case "sck", "screencapturekit":
            return .screenCaptureKit
        default:
            return .automatic
        }
    }

    public static func make(
        mode: AudioCaptureMode
    ) -> AudioCaptureService {
        switch mode {
        case .screenCaptureKit, .automatic:
            guard #available(macOS 13.0, *) else {
                return UnavailableAudioCaptureService(error: AudioCaptureFactoryError.unsupportedMacOS)
            }

            return SCKAudioCaptureService()
        }
    }

    public static func make(
        environment: [String: String]
    ) -> AudioCaptureService {
        make(mode: mode(from: environment))
    }
}

public enum AudioCaptureFactoryError: Error {
    case unsupportedMacOS
}

public final class UnavailableAudioCaptureService: AudioCaptureService {
    public var onChunk: ((Data, Int64) -> Void)?

    private let error: Error

    public init(error: Error) {
        self.error = error
    }

    public func start() throws {
        throw error
    }

    public func stop() {}
}
