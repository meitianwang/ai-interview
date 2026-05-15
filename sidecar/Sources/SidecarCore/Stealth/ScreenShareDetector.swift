import CoreGraphics
import Foundation

public final class ScreenShareDetector {
    public typealias Handler = (Bool) -> Void
    public typealias Probe = () -> Bool

    public var onChange: Handler?

    private var timer: Timer?
    private var lastActive = false
    private let displayCaptureProbe: Probe
    private let recorderProbe: Probe

    private static let recorderOwners = [
        "obs",
        "quicktime player",
        "zoom",
        "zoom.us",
        "腾讯会议",
        "飞书",
        "feishu",
        "lark",
        "microsoft teams",
    ]

    public init(
        displayCaptureProbe: Probe? = nil,
        recorderProbe: Probe? = nil
    ) {
        self.displayCaptureProbe = displayCaptureProbe ?? ScreenShareDetector.defaultDisplayCaptureProbe
        self.recorderProbe = recorderProbe ?? ScreenShareDetector.defaultRecorderProbe
    }

    public func start(intervalSec: TimeInterval = 1.0) {
        stop()
        let timer = Timer(timeInterval: intervalSec, repeats: true) { [weak self] _ in
            self?.poll()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        poll()
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    public func poll() {
        let active = displayCaptureProbe() || recorderProbe()
        guard active != lastActive else {
            return
        }

        lastActive = active
        onChange?(active)
    }

    private static func defaultDisplayCaptureProbe() -> Bool {
        false
    }

    private static func defaultRecorderProbe() -> Bool {
        guard let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] else {
            return false
        }

        return windows.contains { window in
            guard let owner = window[kCGWindowOwnerName as String] as? String else {
                return false
            }
            let normalizedOwner = owner.lowercased()
            return recorderOwners.contains { normalizedOwner.contains($0) }
        }
    }
}
