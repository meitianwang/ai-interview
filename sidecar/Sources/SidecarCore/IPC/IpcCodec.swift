import Foundation

public enum IpcCodec {
    public static func encode(_ event: SidecarEvent) throws -> Data {
        var data = try JSONSerialization.data(withJSONObject: makeEnvelope(event), options: [.sortedKeys])
        data.append(0x0A)
        return data
    }

    public static func decodeCommand(_ line: String) throws -> ElectronCommand {
        guard let json = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
              intValue(json["v"]) == 1 else {
            throw IpcError.unsupported
        }

        let type = json["t"] as? String ?? ""
        let seq = intValue(json["seq"]) ?? 0
        let ts = int64Value(json["ts"]) ?? 0
        let payload = json["p"] as? [String: Any] ?? [:]

        switch type {
        case "capture.start":
            return .captureStart(seq: seq, ts: ts)
        case "capture.stop":
            return .captureStop(seq: seq, ts: ts)
        case "screenshot.request":
            return .screenshotRequest(seq: seq, ts: ts, region: decodeRegion(payload["region"]))
        case "window.set-stealth":
            return .windowSetStealth(
                seq: seq,
                ts: ts,
                windowId: payload["windowId"] as? String ?? "",
                sharingType: payload["sharingType"] as? String ?? "readWrite"
            )
        case "ping":
            return .ping(seq: seq, ts: ts, token: payload["token"] as? String ?? "")
        default:
            throw IpcError.unknownType(type)
        }
    }

    private static func makeEnvelope(_ event: SidecarEvent) -> [String: Any] {
        switch event {
        case .ready(let seq, let ts, let version):
            return ["v": 1, "t": "ready", "seq": seq, "ts": ts, "p": ["version": version]]
        case .audioChunk(let seq, let ts, let pcmBase64):
            return [
                "v": 1,
                "t": "audio.chunk",
                "seq": seq,
                "ts": ts,
                "p": ["pcm_b64": pcmBase64, "sample_rate": 16000, "channels": 1],
            ]
        case .ocrResult(let seq, let ts, let text, let boxes):
            var payload: [String: Any] = ["text": text]
            if let boxes {
                payload["boxes"] = boxes
            }
            return ["v": 1, "t": "ocr.result", "seq": seq, "ts": ts, "p": payload]
        case .hotkeyFired(let seq, let ts, let id):
            return ["v": 1, "t": "hotkey.fired", "seq": seq, "ts": ts, "p": ["id": id]]
        case .screenShareChanged(let seq, let ts, let active):
            return ["v": 1, "t": "screen-share.changed", "seq": seq, "ts": ts, "p": ["active": active]]
        }
    }

    private static func decodeRegion(_ value: Any?) -> ScreenRegion? {
        guard let json = value as? [String: Any] else {
            return nil
        }

        return ScreenRegion(
            x: intValue(json["x"]) ?? 0,
            y: intValue(json["y"]) ?? 0,
            w: intValue(json["w"]) ?? 0,
            h: intValue(json["h"]) ?? 0
        )
    }

    private static func intValue(_ value: Any?) -> Int? {
        if let value = value as? Int {
            return value
        }
        if let value = value as? NSNumber {
            return value.intValue
        }
        return nil
    }

    private static func int64Value(_ value: Any?) -> Int64? {
        if let value = value as? Int64 {
            return value
        }
        if let value = value as? Int {
            return Int64(value)
        }
        if let value = value as? NSNumber {
            return value.int64Value
        }
        return nil
    }
}

public enum IpcError: Error, Equatable {
    case unsupported
    case unknownType(String)
}
