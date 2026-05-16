import Foundation
import XCTest
@testable import SidecarCore

final class AudioCaptureFactoryTests: XCTestCase {
    func testModeFromEnvironment() {
        XCTAssertEqual(AudioCaptureFactory.mode(from: [:]), .automatic)
        XCTAssertEqual(AudioCaptureFactory.mode(from: ["SIDECAR_AUDIO_PROVIDER": "mock"]), .mock)
        XCTAssertEqual(AudioCaptureFactory.mode(from: ["SIDECAR_AUDIO_PROVIDER": "sck"]), .screenCaptureKit)
        XCTAssertEqual(AudioCaptureFactory.mode(from: ["SIDECAR_AUDIO_PROVIDER": "ScreenCaptureKit"]), .screenCaptureKit)
    }

    func testForcedMockBuildsMockService() {
        let service = AudioCaptureFactory.make(mode: .mock)

        XCTAssertTrue(service is MockAudioCaptureService)
    }

    func testFallbackStartsFallbackWhenPrimaryThrows() throws {
        let primary = ThrowingAudioCaptureService()
        let fallback = RecordingAudioCaptureService()
        let service = FallbackAudioCaptureService(primary: primary, fallback: fallback)
        var received: Data?
        service.onChunk = { data, _ in
            received = data
        }

        try service.start()
        fallback.emit(Data([1, 2, 3]), ts: 123)

        XCTAssertTrue(primary.didStart)
        XCTAssertTrue(primary.didStop)
        XCTAssertTrue(fallback.didStart)
        XCTAssertEqual(received, Data([1, 2, 3]))
    }
}

private final class ThrowingAudioCaptureService: AudioCaptureService {
    var onChunk: ((Data, Int64) -> Void)?
    var didStart = false
    var didStop = false

    func start() throws {
        didStart = true
        throw TestAudioCaptureError.startFailed
    }

    func stop() {
        didStop = true
    }
}

private final class RecordingAudioCaptureService: AudioCaptureService {
    var onChunk: ((Data, Int64) -> Void)?
    var didStart = false

    func start() throws {
        didStart = true
    }

    func stop() {}

    func emit(_ data: Data, ts: Int64) {
        onChunk?(data, ts)
    }
}

private enum TestAudioCaptureError: Error {
    case startFailed
}
