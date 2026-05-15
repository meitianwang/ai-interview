import XCTest
@testable import SidecarCore

final class ScreenShareDetectorTests: XCTestCase {
    func testEmitsOnlyWhenActiveStateChanges() {
        var recorderActive = false
        let detector = ScreenShareDetector(
            displayCaptureProbe: { false },
            recorderProbe: { recorderActive }
        )
        var changes: [Bool] = []
        detector.onChange = { changes.append($0) }

        detector.poll()
        recorderActive = true
        detector.poll()
        detector.poll()
        recorderActive = false
        detector.poll()

        XCTAssertEqual(changes, [true, false])
    }

    func testDisplayCaptureProbeMarksActive() {
        let detector = ScreenShareDetector(
            displayCaptureProbe: { true },
            recorderProbe: { false }
        )
        var changes: [Bool] = []
        detector.onChange = { changes.append($0) }

        detector.poll()

        XCTAssertEqual(changes, [true])
    }
}
