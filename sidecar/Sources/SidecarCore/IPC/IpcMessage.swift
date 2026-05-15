import Foundation

public enum SidecarEvent {
    case ready(seq: Int, ts: Int64, version: String)
    case audioChunk(seq: Int, ts: Int64, pcmBase64: String)
    case ocrResult(seq: Int, ts: Int64, text: String, boxes: [[Double]]?)
    case hotkeyFired(seq: Int, ts: Int64, id: String)
    case screenShareChanged(seq: Int, ts: Int64, active: Bool)
}

public enum ElectronCommand {
    case captureStart(seq: Int, ts: Int64)
    case captureStop(seq: Int, ts: Int64)
    case screenshotRequest(seq: Int, ts: Int64, region: ScreenRegion?)
    case windowSetStealth(seq: Int, ts: Int64, windowId: String, sharingType: String)
    case ping(seq: Int, ts: Int64, token: String)
}

public struct ScreenRegion: Codable, Equatable {
    public let x: Int
    public let y: Int
    public let w: Int
    public let h: Int

    public init(x: Int, y: Int, w: Int, h: Int) {
        self.x = x
        self.y = y
        self.w = w
        self.h = h
    }
}
