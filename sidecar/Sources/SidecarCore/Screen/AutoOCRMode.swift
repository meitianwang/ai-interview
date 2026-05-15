import CoreGraphics
import Foundation

@available(macOS 13.0, *)
public final class AutoOCRMode {
    public typealias Emit = (String) -> Void

    public var onText: Emit?

    private let capture = ScreenCaptureService()
    private var lastText = ""
    private var timer: Timer?

    public init() {}

    public func start(intervalSec: TimeInterval = 3.0) {
        stop()
        let timer = Timer(timeInterval: intervalSec, repeats: true) { [weak self] _ in
            Task {
                await self?.tick()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    public static func hasChangedSignificantly(old: String, new: String, threshold: Double = 0.3) -> Bool {
        let oldText = old.trimmingCharacters(in: .whitespacesAndNewlines)
        let newText = new.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newText.isEmpty else {
            return false
        }
        guard !oldText.isEmpty else {
            return true
        }

        let oldChars = Array(oldText)
        let newChars = Array(newText)
        let maxCount = max(oldChars.count, newChars.count)
        guard maxCount > 0 else {
            return false
        }

        let commonCount = min(oldChars.count, newChars.count)
        var changedCount = abs(oldChars.count - newChars.count)
        for index in 0..<commonCount where oldChars[index] != newChars[index] {
            changedCount += 1
        }

        return Double(changedCount) / Double(maxCount) >= threshold
    }

    private func tick() async {
        do {
            guard let image = try await capture.captureMainDisplay() else {
                return
            }

            let result = try await OCRService.recognize(image: image)
            if Self.hasChangedSignificantly(old: lastText, new: result.text) {
                lastText = result.text
                onText?(result.text)
            }
        } catch {
            print("autoOCR err: \(error)")
        }
    }
}
