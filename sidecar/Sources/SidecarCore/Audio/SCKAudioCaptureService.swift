import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

@available(macOS 13.0, *)
public final class SCKAudioCaptureService: NSObject, AudioCaptureService, SCStreamOutput {
    public var onChunk: ((Data, Int64) -> Void)?

    private var stream: SCStream?
    private let sampleQueue = DispatchQueue(label: "ai-interview.sck-audio")

    public func start() throws {
        Task { [weak self] in
            guard let self else {
                return
            }

            do {
                let content = try await SCShareableContent.current
                guard let display = content.displays.first else {
                    throw SCKAudioCaptureError.noDisplay
                }

                let filter = SCContentFilter(
                    display: display,
                    excludingApplications: [],
                    exceptingWindows: []
                )
                let configuration = SCStreamConfiguration()
                configuration.capturesAudio = true
                configuration.excludesCurrentProcessAudio = true
                configuration.sampleRate = 16_000
                configuration.channelCount = 1
                configuration.queueDepth = 5

                let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
                try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue)
                try await stream.startCapture()
                self.stream = stream
            } catch {
                print("[SCKAudioCaptureService] start failed: \(error)")
            }
        }
    }

    public func stop() {
        let stream = self.stream
        self.stream = nil

        Task {
            try? await stream?.stopCapture()
        }
    }

    public func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .audio,
              let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else {
            return
        }

        var lengthAtOffset = 0
        var totalLength = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(
            blockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: &lengthAtOffset,
            totalLengthOut: &totalLength,
            dataPointerOut: &dataPointer
        )
        guard status == kCMBlockBufferNoErr, let dataPointer else {
            return
        }

        let data = Data(bytes: dataPointer, count: totalLength)
        let ts = Int64(Date().timeIntervalSince1970 * 1000)
        onChunk?(data, ts)
    }
}

public enum SCKAudioCaptureError: Error {
    case noDisplay
}
