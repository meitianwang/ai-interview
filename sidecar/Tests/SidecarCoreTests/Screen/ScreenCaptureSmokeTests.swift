import XCTest
@testable import SidecarCore

@available(macOS 13.0, *)
final class ScreenCaptureSmokeTests: XCTestCase {
    func testInstantiate() {
        _ = ScreenCaptureService()
    }
}
