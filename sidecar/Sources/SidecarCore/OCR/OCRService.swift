import CoreGraphics
import Foundation
import Vision

public enum OCRService {
    public struct Result {
        public let text: String
        public let boxes: [[Double]]
    }

    public static func recognize(image: CGImage) async throws -> Result {
        try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
                var lines: [String] = []
                var boxes: [[Double]] = []

                for observation in observations {
                    guard let text = observation.topCandidates(1).first else {
                        continue
                    }

                    let box = observation.boundingBox
                    lines.append(text.string)
                    boxes.append([Double(box.minX), Double(box.minY), Double(box.width), Double(box.height)])
                }

                continuation.resume(returning: Result(text: lines.joined(separator: "\n"), boxes: boxes))
            }
            request.recognitionLanguages = ["zh-Hans", "en-US"]
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true

            do {
                try VNImageRequestHandler(cgImage: image).perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}
