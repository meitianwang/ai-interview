import XCTest
@testable import SidecarCore

final class IpcCodecTests: XCTestCase {
    func testEncodeReadyEvent() throws {
        let event = SidecarEvent.ready(seq: 1, ts: 100, version: "0.0.1")
        let data = try IpcCodec.encode(event)
        let string = String(data: data, encoding: .utf8)!

        XCTAssertTrue(string.hasSuffix("\n"))
        XCTAssertTrue(string.contains("\"t\":\"ready\""))
    }

    func testEncodeScreenShareChangedEvent() throws {
        let event = SidecarEvent.screenShareChanged(seq: 2, ts: 300, active: true)
        let data = try IpcCodec.encode(event)
        let string = String(data: data, encoding: .utf8)!

        XCTAssertTrue(string.contains("\"t\":\"screen-share.changed\""))
        XCTAssertTrue(string.contains("\"active\":true"))
    }

    func testDecodePing() throws {
        let line = #"{"v":1,"t":"ping","seq":7,"ts":200,"p":{"token":"abc"}}"#

        guard case .ping(let seq, let ts, let token) = try IpcCodec.decodeCommand(line) else {
            XCTFail("expected ping")
            return
        }

        XCTAssertEqual(seq, 7)
        XCTAssertEqual(ts, 200)
        XCTAssertEqual(token, "abc")
    }
}
