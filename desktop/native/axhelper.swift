// axhelper — minimal Accessibility API bridge for PromptButton (macOS).
//
//   axhelper focused [--blind id,id] → JSON about the frontmost app and its focused text element
//                                 (apps listed as blind expose nothing: do not wait for them)
//   axhelper set <pid> < text   → sets AXValue of <pid>'s focused element to stdin, prints the read-back value
//   axhelper activate <pid>     → brings <pid> to the front and waits until it really is frontmost
//   axhelper paste <pid> all|selection → ⌘A (optional) + ⌘V, only once <pid> is frontmost and no modifier is held
//   axhelper copy               → ⌘C in the frontmost app
//   axhelper copy all <pid>     → ⌘A, ⌘C, then → to drop the selection: reads a box the app does not describe
//
// Keys are posted as CGEvents from here rather than through AppleScript's System Events: that needs
// only the Accessibility permission the app already has, where System Events needs a second one
// (Automation) that macOS asks for separately and resets with every unsigned build.
//
// Uses AXUIElementCreateSystemWide / CreateApplication directly because AppleScript's
// System Events returns "missing value" for the focused element of Chromium-based apps
// (Chrome, VS Code, Slack, …). Those apps only build their accessibility tree once an
// assistive client asks for it (AXManualAccessibility / AXEnhancedUserInterface).
import ApplicationServices
import Carbon
import Cocoa
import Foundation

func copyAttribute(_ element: AXUIElement, _ name: String) -> (AnyObject?, AXError) {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return (result == .success ? value : nil, result)
}

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    copyAttribute(element, name).0
}

func string(_ element: AXUIElement, _ name: String) -> String? {
    guard let value = attribute(element, name) else { return nil }
    if let s = value as? String { return s }
    if let n = value as? NSNumber { return n.stringValue }
    return nil
}

func bool(_ element: AXUIElement, _ name: String) -> Bool {
    (attribute(element, name) as? Bool) ?? false
}

func setFlag(_ element: AXUIElement, _ name: String, _ on: Bool) -> AXError {
    AXUIElementSetAttributeValue(element, name as CFString, (on ? kCFBooleanTrue : kCFBooleanFalse) as CFTypeRef)
}

func focusedWindow(of app: AXUIElement) -> AXUIElement? {
    if let w = attribute(app, kAXFocusedWindowAttribute as String) { return (w as! AXUIElement) }
    if let w = attribute(app, kAXMainWindowAttribute as String) { return (w as! AXUIElement) }
    return nil
}

/// Breadth-first search for the element that reports AXFocused, skipping containers.
func searchFocused(from root: AXUIElement, budget: Int) -> AXUIElement? {
    var queue: [AXUIElement] = [root]
    var visited = 0
    let containers: Set<String> = ["AXWindow", "AXWebArea", "AXGroup", "AXScrollArea", "AXSplitGroup", "AXTabGroup", "AXToolbar", "AXApplication"]
    while !queue.isEmpty && visited < budget {
        let element = queue.removeFirst()
        visited += 1
        let role = string(element, kAXRoleAttribute as String) ?? ""
        if bool(element, kAXFocusedAttribute as String) && !containers.contains(role) {
            return element
        }
        if let children = attribute(element, kAXChildrenAttribute as String) as? [AXUIElement] {
            queue.append(contentsOf: children)
        }
    }
    return nil
}

struct FocusResult {
    var element: AXUIElement?
    var diagnostics: [String: Any] = [:]
}

/// Chromium browsers build the accessibility tree of the page only while an assistive client holds
/// AXEnhancedUserInterface on, and need about two seconds the first time. So: wait long enough, and
/// when the flag is what made the field appear, leave it on, so the next press is instant.
func findFocusedElement(app: AXUIElement, patient: Bool = true) -> FocusResult {
    var result = FocusResult()
    result.diagnostics["manualAccessibility"] = Int(setFlag(app, "AXManualAccessibility", true).rawValue)
    var enhancedSet = false
    var foundAfterEnhanced = false
    for attempt in 0..<(patient ? 20 : 2) {
        let (fromApp, appError) = copyAttribute(app, kAXFocusedUIElementAttribute as String)
        if let fromApp = fromApp {
            result.element = (fromApp as! AXUIElement)
            result.diagnostics["via"] = "app"
            foundAfterEnhanced = enhancedSet
            break
        }
        let (fromSystem, systemError) = copyAttribute(AXUIElementCreateSystemWide(), kAXFocusedUIElementAttribute as String)
        if let fromSystem = fromSystem {
            result.element = (fromSystem as! AXUIElement)
            result.diagnostics["via"] = "system"
            foundAfterEnhanced = enhancedSet
            break
        }
        result.diagnostics["appError"] = Int(appError.rawValue)
        result.diagnostics["systemError"] = Int(systemError.rawValue)
        if attempt == 1 {
            result.diagnostics["enhancedUI"] = Int(setFlag(app, "AXEnhancedUserInterface", true).rawValue)
            enhancedSet = true
        }
        usleep(150_000)
    }
    if result.element == nil, let window = focusedWindow(of: app) {
        if let found = searchFocused(from: window, budget: 4000) {
            result.element = found
            result.diagnostics["via"] = "tree"
        } else {
            result.diagnostics["via"] = "none"
        }
    }
    if enhancedSet && !foundAfterEnhanced {
        // The flag did not help: leave the app as we found it (some apps animate oddly while it is on).
        _ = setFlag(app, "AXEnhancedUserInterface", false)
    }
    if foundAfterEnhanced { result.diagnostics["keptEnhancedUI"] = true }
    return result
}

func windowBounds(of app: AXUIElement) -> [String: Int]? {
    guard let win = focusedWindow(of: app) else { return nil }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard let posValue = attribute(win, kAXPositionAttribute as String),
          let sizeValue = attribute(win, kAXSizeAttribute as String),
          AXValueGetValue(posValue as! AXValue, .cgPoint, &point),
          AXValueGetValue(sizeValue as! AXValue, .cgSize, &size) else { return nil }
    return ["x": Int(point.x), "y": Int(point.y), "w": Int(size.width), "h": Int(size.height)]
}

func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

/// The pid that has keyboard focus right now. Asked from the Accessibility server each time, because
/// NSWorkspace's value only refreshes on a running run loop, which this short-lived tool does not have.
func frontmostPid() -> pid_t {
    if let focusedApp = attribute(AXUIElementCreateSystemWide(), kAXFocusedApplicationAttribute as String) {
        var pid: pid_t = 0
        if AXUIElementGetPid(focusedApp as! AXUIElement, &pid) == .success, pid > 0 { return pid }
    }
    RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    return NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
}

/// Brings the app forward and waits until macOS reports it frontmost. Returns false if it never is.
func bringToFront(_ pid: pid_t, timeout: TimeInterval) -> Bool {
    if frontmostPid() == pid { return true }
    guard let running = NSRunningApplication(processIdentifier: pid), !running.isTerminated else { return false }
    let deadline = Date().addingTimeInterval(timeout)
    var attempt = 0
    while Date() < deadline {
        // Two ways in turn: AppKit activation can be refused for a background app on macOS 14+,
        // the Accessibility attribute is not.
        if attempt % 2 == 0 { running.activate(options: [.activateAllWindows]) }
        else { _ = setFlag(AXUIElementCreateApplication(pid), kAXFrontmostAttribute as String, true) }
        attempt += 1
        for _ in 0..<6 {
            usleep(50_000)
            if frontmostPid() == pid { return true }
        }
    }
    return frontmostPid() == pid
}

/// The key that types `character` on the current keyboard layout, so ⌘V is ⌘V on Dvorak or AZERTY too.
/// Layouts without that Latin letter (Cyrillic, Greek…) fall back to the ANSI position, which is where
/// macOS itself maps their ⌘ shortcuts.
func keyCode(for character: String, fallback: CGKeyCode) -> CGKeyCode {
    guard let source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
          let pointer = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else { return fallback }
    let data = Unmanaged<CFData>.fromOpaque(pointer).takeUnretainedValue() as Data
    return data.withUnsafeBytes { raw -> CGKeyCode in
        guard let layout = raw.bindMemory(to: UCKeyboardLayout.self).baseAddress else { return fallback }
        for code in 0..<UInt16(128) {
            var dead: UInt32 = 0
            var length = 0
            var chars = [UniChar](repeating: 0, count: 4)
            let status = UCKeyTranslate(layout, code, UInt16(kUCKeyActionDown), 0, UInt32(LMGetKbdType()),
                                        OptionBits(kUCKeyTranslateNoDeadKeysBit), &dead, 4, &length, &chars)
            if status == noErr, length == 1, String(utf16CodeUnits: chars, count: 1) == character { return CGKeyCode(code) }
        }
        return fallback
    }
}

/// Waits (briefly) until ⌘ ⌥ ⌃ ⇧ are all up: a shortcut key still held down would turn ⌘V into ⌥⇧⌘V.
func waitForModifiersReleased(timeout: TimeInterval) -> Bool {
    let held: CGEventFlags = [.maskCommand, .maskAlternate, .maskControl, .maskShift]
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if CGEventSource.flagsState(.combinedSessionState).intersection(held).isEmpty { return true }
        usleep(25_000)
    }
    return CGEventSource.flagsState(.combinedSessionState).intersection(held).isEmpty
}

func pressCommand(_ key: CGKeyCode) {
    let source = CGEventSource(stateID: .combinedSessionState)
    for down in [true, false] {
        guard let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: down) else { continue }
        event.flags = .maskCommand
        event.post(tap: .cghidEventTap)
        usleep(12_000)
    }
}

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : "focused"

guard AXIsProcessTrusted() else {
    emit(["error": "accessibility_not_trusted"])
    exit(2)
}

switch command {
case "focused":
    guard let frontmost = NSWorkspace.shared.frontmostApplication else {
        emit(["error": "no_frontmost_app"])
        exit(1)
    }
    let pid = frontmost.processIdentifier
    let app = AXUIElementCreateApplication(pid)
    var out: [String: Any] = [
        "app": frontmost.localizedName ?? "",
        "bundleId": frontmost.bundleIdentifier ?? "",
        "pid": Int(pid),
    ]
    if let bounds = windowBounds(of: app) { out["bounds"] = bounds }
    // Electron apps (under any framework name) ship their code as app.asar. Their editors take text
    // only through real paste events, so the caller must not write the field's value directly.
    if let resources = frontmost.bundleURL?.appendingPathComponent("Contents/Resources/app.asar").path {
        out["electron"] = FileManager.default.fileExists(atPath: resources)
    }
    var blind: [String] = []
    if let flag = args.firstIndex(of: "--blind"), args.count > flag + 1 { blind = args[flag + 1].split(separator: ",").map(String.init) }
    let focus = findFocusedElement(app: app, patient: !blind.contains(frontmost.bundleIdentifier ?? ""))
    out["diagnostics"] = focus.diagnostics
    if let focused = focus.element {
        out["role"] = string(focused, kAXRoleAttribute as String) ?? ""
        out["subrole"] = string(focused, kAXSubroleAttribute as String) ?? ""
        let value = string(focused, kAXValueAttribute as String) ?? ""
        // Chromium/Electron fields report their placeholder as the value when empty.
        let placeholder = string(focused, kAXPlaceholderValueAttribute as String) ?? ""
        out["placeholder"] = placeholder
        out["value"] = (!placeholder.isEmpty && value == placeholder) ? "" : value
        out["selectedText"] = string(focused, kAXSelectedTextAttribute as String) ?? ""
        var settable: DarwinBoolean = false
        AXUIElementIsAttributeSettable(focused, kAXValueAttribute as CFString, &settable)
        out["valueSettable"] = settable.boolValue
    } else {
        out["role"] = ""
        out["value"] = ""
        out["selectedText"] = ""
        out["valueSettable"] = false
    }
    emit(out)

case "set":
    guard args.count > 2, let pid = pid_t(args[2]) else {
        emit(["error": "usage: axhelper set <pid> < text"])
        exit(1)
    }
    let text = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let app = AXUIElementCreateApplication(pid)
    let focus = findFocusedElement(app: app)
    guard let focused = focus.element else {
        emit(["error": "no_focused_element", "diagnostics": focus.diagnostics])
        exit(1)
    }
    let result = AXUIElementSetAttributeValue(focused, kAXValueAttribute as CFString, text as CFTypeRef)
    usleep(80_000)
    emit([
        "set": result == .success,
        "axError": Int(result.rawValue),
        "value": string(focused, kAXValueAttribute as String) ?? "",
    ])

case "activate":
    guard args.count > 2, let pid = pid_t(args[2]) else {
        emit(["error": "usage: axhelper activate <pid>"])
        exit(1)
    }
    guard let running = NSRunningApplication(processIdentifier: pid), !running.isTerminated else {
        emit(["error": "app_not_running"])
        exit(1)
    }
    let ok = bringToFront(pid, timeout: 2.0)
    emit(["frontmost": ok, "frontPid": Int(frontmostPid())])

case "paste":
    guard args.count > 3, let pid = pid_t(args[2]) else {
        emit(["error": "usage: axhelper paste <pid> all|selection"])
        exit(1)
    }
    guard let running = NSRunningApplication(processIdentifier: pid), !running.isTerminated else {
        emit(["error": "app_not_running"])
        exit(1)
    }
    // A focused password field (or Terminal's Secure Keyboard Entry) makes macOS drop posted keys.
    if IsSecureEventInputEnabled() {
        emit(["error": "secure_input"])
        exit(1)
    }
    guard bringToFront(pid, timeout: 1.5) else {
        emit(["error": "target_not_frontmost", "frontPid": Int(frontmostPid())])
        exit(1)
    }
    let released = waitForModifiersReleased(timeout: 1.2)
    // The last check before the keys go out: they must land in the target, never in whatever took focus meanwhile.
    guard frontmostPid() == pid else {
        emit(["error": "target_not_frontmost", "frontPid": Int(frontmostPid())])
        exit(1)
    }
    if args[3] == "all" {
        pressCommand(keyCode(for: "a", fallback: 0))
        usleep(90_000)
    }
    pressCommand(keyCode(for: "v", fallback: 9))
    emit(["pasted": true, "modifiersReleased": released])

case "copy":
    if IsSecureEventInputEnabled() {
        emit(["error": "secure_input"])
        exit(1)
    }
    let released = waitForModifiersReleased(timeout: 0.8)
    if args.count > 3, args[2] == "all", let pid = pid_t(args[3]) {
        // Read a whole box the app does not describe. Only ever in the app we mean to read.
        guard frontmostPid() == pid else {
            emit(["error": "target_not_frontmost", "frontPid": Int(frontmostPid())])
            exit(1)
        }
        pressCommand(keyCode(for: "a", fallback: 0))
        usleep(90_000)
        pressCommand(keyCode(for: "c", fallback: 8))
        usleep(120_000)
        // → drops the selection and leaves the caret at the end, so the next key typed cannot wipe the text.
        if let source = CGEventSource(stateID: .combinedSessionState) {
            for down in [true, false] {
                CGEvent(keyboardEventSource: source, virtualKey: 124, keyDown: down)?.post(tap: .cghidEventTap)
                usleep(12_000)
            }
        }
        emit(["copied": true, "all": true, "modifiersReleased": released])
    } else {
        pressCommand(keyCode(for: "c", fallback: 8))
        emit(["copied": true, "modifiersReleased": released])
    }

case "focusfield":
    // Test support (scripts/paste-test.ts): put the keyboard into the app's first text area, as a click would.
    guard args.count > 2, let pid = pid_t(args[2]) else { exit(1) }
    let target = AXUIElementCreateApplication(pid)
    _ = setFlag(target, "AXManualAccessibility", true)
    var found: AXUIElement?
    if let window = focusedWindow(of: target) {
        var queue: [AXUIElement] = [window]
        var visited = 0
        var fallback: AXUIElement?
        while !queue.isEmpty && visited < 6000 && found == nil {
            let element = queue.removeFirst()
            visited += 1
            let role = string(element, kAXRoleAttribute as String) ?? ""
            if role == "AXTextArea" { found = element }
            else if role == "AXTextField" && fallback == nil { fallback = element }
            if let children = attribute(element, kAXChildrenAttribute as String) as? [AXUIElement] { queue.append(contentsOf: children) }
        }
        if found == nil { found = fallback }
    }
    guard let field = found else {
        emit(["error": "no_text_field"])
        exit(1)
    }
    let result = setFlag(field, kAXFocusedAttribute as String, true)
    emit(["focused": result == .success, "role": string(field, kAXRoleAttribute as String) ?? ""])

case "dump":
    // Debug: breadth-first listing of the frontmost window's tree (role, subrole, focused, value length).
    guard let frontmost = NSWorkspace.shared.frontmostApplication else { exit(1) }
    let app = AXUIElementCreateApplication(frontmost.processIdentifier)
    _ = setFlag(app, "AXManualAccessibility", true)
    _ = setFlag(app, "AXEnhancedUserInterface", true)
    usleep(500_000)
    let limit = args.count > 2 ? Int(args[2]) ?? 300 : 300
    var lines: [String] = ["app=\(frontmost.localizedName ?? "") pid=\(frontmost.processIdentifier)"]
    let (focusedApp, focusedErr) = copyAttribute(app, kAXFocusedUIElementAttribute as String)
    lines.append("focusedUIElement: \(focusedApp == nil ? "nil (\(focusedErr.rawValue))" : "present")")
    if let window = focusedWindow(of: app) {
        var queue: [(AXUIElement, Int)] = [(window, 0)]
        var visited = 0
        while !queue.isEmpty && visited < limit {
            let (element, depth) = queue.removeFirst()
            visited += 1
            let role = string(element, kAXRoleAttribute as String) ?? "?"
            let subrole = string(element, kAXSubroleAttribute as String) ?? ""
            let focused = bool(element, kAXFocusedAttribute as String)
            let valueLength = (string(element, kAXValueAttribute as String) ?? "").count
            let (children, childErr) = copyAttribute(element, kAXChildrenAttribute as String)
            let kids = (children as? [AXUIElement]) ?? []
            if focused || depth < 3 || role.hasPrefix("AXText") || role == "AXWebArea" {
                lines.append("\(String(repeating: "  ", count: depth))\(role)\(subrole.isEmpty ? "" : "/" + subrole) focused=\(focused) valueLen=\(valueLength) children=\(kids.count)\(children == nil ? " (err \(childErr.rawValue))" : "")")
            }
            for kid in kids { queue.append((kid, depth + 1)) }
        }
        lines.append("visited=\(visited)")
    } else {
        lines.append("no focused window")
    }
    _ = setFlag(app, "AXEnhancedUserInterface", false)
    print(lines.joined(separator: "\n"))

default:
    emit(["error": "unknown command \(command)"])
    exit(1)
}
