import Darwin
import XCTest
@testable import SidecarCore

final class IpcServerTests: XCTestCase {
    func testServerListensAndEmitsReady() async throws {
        let path = NSTemporaryDirectory() + "ipctest-\(UUID().uuidString).sock"
        defer { try? FileManager.default.removeItem(atPath: path) }

        let server = IpcServer(socketPath: path)
        try server.start()
        defer { server.stop() }

        let line = try await connectAndReadOneLine(path: path)
        XCTAssertTrue(line.contains("\"t\":\"ready\""))
        XCTAssertTrue(line.contains("\"\(IpcProtocol.version)\""))
        try await waitForOwnerOnlySocketMode(path: path)
    }

    private func connectAndReadOneLine(path: String) async throws -> String {
        try await waitForSocket(path: path)

        let descriptor = socket(AF_UNIX, SOCK_STREAM, 0)
        XCTAssertGreaterThanOrEqual(descriptor, 0)
        defer { close(descriptor) }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        _ = path.withCString { source in
            withUnsafeMutablePointer(to: &address.sun_path) { pointer in
                pointer.withMemoryRebound(to: CChar.self, capacity: 104) { destination in
                    strncpy(destination, source, 103)
                }
            }
        }

        let connected = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                connect(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        XCTAssertEqual(connected, 0)

        var buffer = [UInt8](repeating: 0, count: 4096)
        let count = recv(descriptor, &buffer, buffer.count, 0)
        XCTAssertGreaterThan(count, 0)
        guard count > 0 else {
            XCTFail("recv failed with count \(count), errno \(errno)")
            return ""
        }

        return String(bytes: buffer.prefix(Int(count)), encoding: .utf8) ?? ""
    }

    private func waitForSocket(path: String) async throws {
        for _ in 0..<50 {
            if FileManager.default.fileExists(atPath: path) {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("socket was not created")
    }

    private func waitForOwnerOnlySocketMode(path: String) async throws {
        for _ in 0..<50 {
            var info = stat()
            if stat(path, &info) == 0, info.st_mode & 0o777 == 0o600 {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        var info = stat()
        _ = stat(path, &info)
        XCTFail("socket mode was \(String(info.st_mode & 0o777, radix: 8)), expected 600")
    }
}
