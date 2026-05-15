import XCTest
@testable import SidecarCore

@available(macOS 13.0, *)
final class SCKAudioCaptureSmokeTests: XCTestCase {
    func testInstantiationDoesNotCrash() {
        let service = SCKAudioCaptureService()

        XCTAssertNotNil(service)
        XCTAssertNoThrow(try service.start())
        service.stop()
    }
}
