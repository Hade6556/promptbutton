// keyprobe — diagnostic: for 45 seconds, print key code + modifiers of key presses that
// include the Option key. Plain typing is NOT logged. Used to see what a hotkey press
// actually delivers. Needs Input Monitoring or Accessibility permission for the caller.
import Cocoa

let seconds = CommandLine.arguments.count > 1 ? Double(CommandLine.arguments[1]) ?? 45 : 45
let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)

let callback: CGEventTapCallBack = { _, _, event, _ in
    let flags = event.flags
    if flags.contains(.maskAlternate) {
        let code = event.getIntegerValueField(.keyboardEventKeycode)
        var mods: [String] = []
        if flags.contains(.maskControl) { mods.append("control") }
        if flags.contains(.maskAlternate) { mods.append("option") }
        if flags.contains(.maskShift) { mods.append("shift") }
        if flags.contains(.maskCommand) { mods.append("command") }
        if flags.contains(.maskSecondaryFn) { mods.append("fn") }
        print("keyDown code=\(code) mods=\(mods.joined(separator: "+"))")
        fflush(stdout)
    }
    return Unmanaged.passUnretained(event)
}

guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: callback, userInfo: nil) else {
    print("tap_failed: this process lacks Input Monitoring permission")
    exit(1)
}
let source = CFMachPortCreateRunLoopSource(nil, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
print("listening for \(Int(seconds))s — press the shortcut now")
fflush(stdout)
DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
    print("done")
    exit(0)
}
CFRunLoopRun()
