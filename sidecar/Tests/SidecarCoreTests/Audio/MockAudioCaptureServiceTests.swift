import XCTest
@testable import SidecarCore

final class MockAudioCaptureServiceTests: XCTestCase {
    func testEmitsChunksAtConfiguredRate() async throws {
        let mock = MockAudioCaptureService(chunkIntervalMs: 50)
        let recorder = ChunkRecorder()

        mock.onChunk = { data, _ in
            Task {
                await recorder.record(byteCount: data.count)
            }
        }

        try mock.start()
        try await Task.sleep(nanoseconds: 220_000_000)
        mock.stop()

        let snapshot = await recorder.snapshot()
        XCTAssertGreaterThanOrEqual(snapshot.count, 3)
        XCTAssertEqual(snapshot.byteCounts, Set([1600]))
    }
}

private actor ChunkRecorder {
    private var count = 0
    private var byteCounts = Set<Int>()

    func record(byteCount: Int) {
        count += 1
        byteCounts.insert(byteCount)
    }

    func snapshot() -> (count: Int, byteCounts: Set<Int>) {
        (count, byteCounts)
    }
}
