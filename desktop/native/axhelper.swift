// axhelper — minimal Accessibility API bridge for PromptButton (macOS).
//
//   axhelper focused            → JSON about the frontmost app and its focused text element
//   axhelper set <pid> < text   → sets AXValue of <pid>'s focused element to stdin, prints the read-back value
//
// Uses AXUIElementCreateSystemWide / CreateApplication directly because AppleScript's
// System Events returns "missing value" for the focused element of Chromium-based apps
// (Chrome, VS Code, Slack, …). Those apps only build their accessibility tree once an
// assistive client asks for it (AXManualAccessibility / AXEnhancedUserInterface).
import ApplicationServices
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

func findFocusedElement(app: AXUIElement) -> FocusResult {
    var result = FocusResult()
    result.diagnostics["manualAccessibility"] = Int(setFlag(app, "AXManualAccessibility", true).rawValue)
    var enhancedSet = false
    for attempt in 0..<8 {
        let (fromApp, appError) = copyAttribute(app, kAXFocusedUIElementAttribute as String)
        if let fromApp = fromApp {
            result.element = (fromApp as! AXUIElement)
            result.diagnostics["via"] = "app"
            break
        }
        let (fromSystem, systemError) = copyAttribute(AXUIElementCreateSystemWide(), kAXFocusedUIElementAttribute as String)
        if let fromSystem = fromSystem {
            result.element = (fromSystem as! AXUIElement)
            result.diagnostics["via"] = "system"
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
    if enhancedSet {
        // Leave the app as we found it; some apps resize oddly while this flag is on.
        _ = setFlag(app, "AXEnhancedUserInterface", false)
    }
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
    let focus = findFocusedElement(app: app)
    out["diagnostics"] = focus.diagnostics
    if let focused = focus.element {
        out["role"] = string(focused, kAXRoleAttribute as String) ?? ""
        out["subrole"] = string(focused, kAXSubroleAttribute as String) ?? ""
        out["value"] = string(focused, kAXValueAttribute as String) ?? ""
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
