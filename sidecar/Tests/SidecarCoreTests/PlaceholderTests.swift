import XCTest
@testable import SidecarCore

final class PlaceholderTests: XCTestCase {
    func testVersionExposed() {
        XCTAssertEqual(SidecarCore.version, "0.0.1")
    }
}
