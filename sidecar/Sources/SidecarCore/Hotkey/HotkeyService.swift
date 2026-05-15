import Carbon
import Foundation

public final class HotkeyService {
    public typealias Handler = (String) -> Void

    public var onFired: Handler?

    private var handlerRef: EventHandlerRef?
    private var refs: [EventHotKeyRef] = []
    private var idsByCarbonID: [UInt32: String] = [:]
    private static let signature = OSType(0x41494E54)

    public init() {}

    deinit {
        unregisterAll()
    }

    public func register(id: String, keyCode: UInt32, modifiers: UInt32) throws {
        try installHandlerIfNeeded()

        let carbonID = UInt32(truncatingIfNeeded: id.hashValue) & 0x7fffffff
        let hotKeyID = EventHotKeyID(signature: Self.signature, id: carbonID)
        var hotKeyRef: EventHotKeyRef?
        let status = RegisterEventHotKey(
            keyCode,
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
        guard status == noErr, let hotKeyRef else {
            throw HotkeyError.registrationFailed(status)
        }

        refs.append(hotKeyRef)
        idsByCarbonID[carbonID] = id
    }

    public func unregisterAll() {
        for ref in refs {
            UnregisterEventHotKey(ref)
        }
        refs.removeAll()
        idsByCarbonID.removeAll()

        if let handlerRef {
            RemoveEventHandler(handlerRef)
            self.handlerRef = nil
        }
    }

    private func installHandlerIfNeeded() throws {
        if handlerRef != nil {
            return
        }

        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        var installedRef: EventHandlerRef?
        let status = InstallEventHandler(
            GetApplicationEventTarget(),
            Self.handleEvent,
            1,
            &spec,
            Unmanaged.passUnretained(self).toOpaque(),
            &installedRef
        )
        guard status == noErr, let installedRef else {
            throw HotkeyError.handlerInstallFailed(status)
        }

        handlerRef = installedRef
    }

    private static let handleEvent: EventHandlerUPP = { _, event, context in
        guard let event, let context else {
            return noErr
        }

        var hotKeyID = EventHotKeyID()
        let status = GetEventParameter(
            event,
            EventParamName(kEventParamDirectObject),
            EventParamType(typeEventHotKeyID),
            nil,
            MemoryLayout<EventHotKeyID>.size,
            nil,
            &hotKeyID
        )
        guard status == noErr, hotKeyID.signature == HotkeyService.signature else {
            return noErr
        }

        let service = Unmanaged<HotkeyService>.fromOpaque(context).takeUnretainedValue()
        guard let id = service.idsByCarbonID[hotKeyID.id] else {
            return noErr
        }

        service.onFired?(id)
        return noErr
    }
}

public enum HotkeyError: Error, Equatable {
    case handlerInstallFailed(OSStatus)
    case registrationFailed(OSStatus)
}
