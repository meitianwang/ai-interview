import Foundation
import XCTest
@testable import SidecarCore

final class AudioCaptureFactoryTests: XCTestCase {
    func testModeFromEnvironment() {
        XCTAssertEqual(AudioCaptureFactory.mode(from: [:]), .automatic)
        XCTAssertEqual(AudioCaptureFactory.mode(from: ["SIDECAR_AUDIO_PROVIDER": "sck"]), .screenCaptureKit)
        XCTAssertEqual(AudioCaptureFactory.mode(from: ["SIDECAR_AUDIO_PROVIDER": "ScreenCaptureKit"]), .screenCaptureKit)
    }

    func testForcedScreenCaptureKitBuildsRealService() {
        let service = AudioCaptureFactory.make(mode: .screenCaptureKit)

        if #available(macOS 13.0, *) {
            XCTAssertTrue(service is SCKAudioCaptureService)
        } else {
            XCTAssertTrue(service is UnavailableAudioCaptureService)
        }
    }
}
