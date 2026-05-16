import XCTest
@testable import SidecarCore

@available(macOS 13.0, *)
final class SCKAudioCaptureSmokeTests: XCTestCase {
    func testInstantiationDoesNotCrash() {
        let service = SCKAudioCaptureService()

        XCTAssertNotNil(service)
        do {
            try service.start()
        } catch SCKAudioCaptureError.permissionDenied {
            return
        } catch {
            XCTFail("unexpected SCK start error: \(error)")
        }
        service.stop()
    }
}
