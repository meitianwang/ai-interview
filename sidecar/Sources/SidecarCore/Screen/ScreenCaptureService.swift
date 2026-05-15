import CoreGraphics
import Foundation
import ScreenCaptureKit

@available(macOS 13.0, *)
public final class ScreenCaptureService {
    public init() {}

    public func captureMainDisplay() async throws -> CGImage? {
        if #available(macOS 14.0, *) {
            return try await captureMainDisplayWithScreenCaptureKit()
        }

        return captureMainDisplayWithCoreGraphics()
    }

    @available(macOS 14.0, *)
    private func captureMainDisplayWithScreenCaptureKit() async throws -> CGImage? {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            return nil
        }

        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let configuration = SCStreamConfiguration()
        configuration.width = display.width
        configuration.height = display.height
        configuration.showsCursor = false

        return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
    }

    private func captureMainDisplayWithCoreGraphics() -> CGImage? {
        let bounds = CGDisplayBounds(CGMainDisplayID())
        return CGWindowListCreateImage(bounds, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution])
    }

    public func captureRegion(_ region: CGRect) async throws -> CGImage? {
        guard let image = try await captureMainDisplay() else {
            return nil
        }

        return image.cropping(to: region)
    }
}
