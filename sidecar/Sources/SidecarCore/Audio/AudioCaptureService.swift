import Foundation

public protocol AudioCaptureService: AnyObject {
    var onChunk: ((Data, Int64) -> Void)? { get set }

    func start() throws
    func stop()
}
