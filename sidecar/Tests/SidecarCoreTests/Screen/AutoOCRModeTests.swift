import XCTest
@testable import SidecarCore

@available(macOS 13.0, *)
final class AutoOCRModeTests: XCTestCase {
    func testEmptyOldTextEmitsNonEmptyText() {
        XCTAssertTrue(AutoOCRMode.hasChangedSignificantly(old: "", new: "Hello"))
    }

    func testIgnoresSmallChanges() {
        XCTAssertFalse(AutoOCRMode.hasChangedSignificantly(old: "abcdefg", new: "abcxefg"))
    }

    func testDetectsSameLengthLargeChanges() {
        XCTAssertTrue(AutoOCRMode.hasChangedSignificantly(old: "abcdef", new: "uvwxyz"))
    }

    func testIgnoresEmptyNewText() {
        XCTAssertFalse(AutoOCRMode.hasChangedSignificantly(old: "abcdef", new: ""))
    }
}
