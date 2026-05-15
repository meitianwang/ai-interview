import AppKit
import CoreGraphics
import XCTest
@testable import SidecarCore

final class OCRServiceTests: XCTestCase {
    func testRecognizesEnglishText() async throws {
        let image = renderText("Hello World", size: CGSize(width: 640, height: 180))

        let result = try await OCRService.recognize(image: image)

        XCTAssertTrue(result.text.localizedCaseInsensitiveContains("Hello"), "recognized text: \(result.text)")
        XCTAssertFalse(result.boxes.isEmpty)
    }

    private func renderText(_ text: String, size: CGSize) -> CGImage {
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.white.setFill()
            rect.fill()
            let attributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.boldSystemFont(ofSize: 64),
                .foregroundColor: NSColor.black,
            ]
            (text as NSString).draw(at: NSPoint(x: 32, y: 54), withAttributes: attributes)
            return true
        }
        var rect = CGRect(origin: .zero, size: size)
        return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
    }
}
