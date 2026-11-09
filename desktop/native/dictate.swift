// dictate — streaming speech-to-text for PromptButton (macOS).
//
//   dictate [locale] [silence]   e.g. `dictate en-US 1.4`; default is the system locale and 1.4 s
//                                 of silence before listening ends by itself (0 = only on request)
//
// Listens on the default microphone and prints one JSON object per line:
//   {"status":"listening"}            once the microphone is open
//   {"status":"auto_stop"}            listening ended on a pause; the final text follows
//   {"level":0.42}                    input level 0–1, about 15 times a second (for the button)
//   {"partial":"what was said so far"}
//   {"final":"the whole utterance"}   then exits 0
//   {"error":"speech_denied"|"mic_denied"|"unavailable"|"<message>"}   then exits non-zero
// Close stdin (or send SIGTERM/SIGINT) to stop listening; the final text follows within ~1 s.
//
// Recognition runs on the device when the locale supports it (requiresOnDeviceRecognition),
// so audio does not leave the Mac.
//
// Privacy prompts: macOS checks the usage description in the *responsible* process's Info.plist.
// Spawned by Electron, that is Electron's bundle, which has no NSSpeechRecognitionUsageDescription,
// and TCC aborts the process. So on start the helper relaunches itself with responsibility
// disclaimed (responsibility_spawnattrs_setdisclaim, the mechanism Terminal-style apps use): the
// child is responsible for itself, TCC reads the Info.plist embedded in this binary
// (desktop/native/dictate-Info.plist, linked into __TEXT,__info_plist), and the Electron bundle
// never has to be modified and re-signed (which would reset its Accessibility and Screen
// Recording grants). The child inherits stdin/stdout; the parent only waits and relays signals.
import AVFoundation
import Darwin
import Foundation
import Speech

setvbuf(stdout, nil, _IOLBF, 0)

private let disclaimedEnv = "PB_DICTATE_DISCLAIMED"

/// Relaunches this binary as its own responsible process and exits with the child's status.
/// Returns only when already disclaimed, or when the SPI is unavailable (then we carry on as-is).
func relaunchDisclaimedIfNeeded() {
    if getenv(disclaimedEnv) != nil { return }
    typealias Disclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim") else { return }
    let disclaim = unsafeBitCast(symbol, to: Disclaim.self)

    var attr: posix_spawnattr_t?
    posix_spawnattr_init(&attr)
    defer { posix_spawnattr_destroy(&attr) }
    guard disclaim(&attr, 1) == 0 else { return }

    setenv(disclaimedEnv, "1", 1)
    let path = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL.path
    var argv: [UnsafeMutablePointer<CChar>?] = CommandLine.arguments.map { strdup($0) } + [nil]
    defer { argv.forEach { free($0) } }
    var pid: pid_t = 0
    guard posix_spawn(&pid, path, nil, &attr, &argv, environ) == 0 else {
        unsetenv(disclaimedEnv)
        return
    }

    // Relay stop signals to the child; it delivers the final text and exits.
    for sig in [SIGTERM, SIGINT, SIGHUP] {
        signal(sig, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: sig, queue: .global())
        source.setEventHandler { kill(pid, SIGTERM) }
        source.resume()
        _relaySources.append(source)
    }
    var status: Int32 = 0
    while waitpid(pid, &status, 0) == -1 && errno == EINTR {}
    let exited = (status & 0x7f) == 0
    exit(exited ? (status >> 8) & 0xff : 1)
}
private var _relaySources: [DispatchSourceSignal] = []

relaunchDisclaimedIfNeeded()

// If whoever started us goes away (Electron quit or crashed), stop listening.
let parentAtStart = getppid()
Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
    if getppid() != parentAtStart { exit(0) }
}

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

let locale = CommandLine.arguments.count > 1 ? Locale(identifier: CommandLine.arguments[1]) : Locale.current
/// Seconds of silence after the user has said something before listening ends by itself (0 = never).
let silenceSeconds = CommandLine.arguments.count > 2 ? (Double(CommandLine.arguments[2]) ?? 1.4) : 1.4
let maxSessionSeconds = 90.0
guard let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(), recognizer.isAvailable else {
    emit(["error": "unavailable"])
    exit(3)
}

let engine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true
request.addsPunctuation = true
if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }

var task: SFSpeechRecognitionTask?
var lastText = ""
var lastChange = Date()
var lastLevel: Float = 0
var stopping = false
var done = false

func finish(_ text: String) {
    if done { return }
    done = true
    emit(["final": text])
    exit(0)
}

func stop() {
    if stopping { return }
    stopping = true
    if engine.isRunning {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
    }
    request.endAudio()
    // The recognizer usually delivers the final result within a few hundred ms; don't hang.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { finish(lastText) }
}

// Stop when the parent closes stdin or signals us.
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let signalSources = [SIGTERM, SIGINT].map { sig -> DispatchSourceSignal in
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler { stop() }
    source.resume()
    return source
}
Thread.detachNewThread {
    while FileHandle.standardInput.availableData.count > 0 {}
    DispatchQueue.main.async { stop() }
}

func start() {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    var lastLevelAt = Date.distantPast
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        request.append(buffer)
        guard Date().timeIntervalSince(lastLevelAt) > 0.066, let samples = buffer.floatChannelData?[0] else { return }
        lastLevelAt = Date()
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for i in 0..<count { sum += samples[i] * samples[i] }
        let rms = count > 0 ? sqrt(sum / Float(count)) : 0
        // −50 dB … 0 dB → 0 … 1
        let db = 20 * log10(max(rms, 0.000_01))
        let level = max(0, min(1, (db + 50) / 50))
        DispatchQueue.main.async { lastLevel = level }
        emit(["level": (Double(level) * 100).rounded() / 100])
    }
    engine.prepare()
    do {
        try engine.start()
    } catch {
        emit(["error": "mic: \(error.localizedDescription)"])
        exit(4)
    }
    emit(["status": "listening"])

    // End on a pause: once something has been said, stop after `silenceSeconds` with no new words
    // and a quiet input. Also stop after `maxSessionSeconds` whatever happens.
    let startedAt = Date()
    lastChange = Date()
    Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
        if stopping { return }
        let quietFor = Date().timeIntervalSince(lastChange)
        if silenceSeconds > 0, !lastText.isEmpty, quietFor >= silenceSeconds, lastLevel < 0.45 {
            emit(["status": "auto_stop"])
            stop()
        } else if Date().timeIntervalSince(startedAt) >= maxSessionSeconds {
            emit(["status": "auto_stop"])
            stop()
        }
    }

    task = recognizer.recognitionTask(with: request) { result, error in
        if let result {
            let text = result.bestTranscription.formattedString
            if text != lastText { lastChange = Date() }
            lastText = text
            if result.isFinal {
                finish(lastText)
                return
            }
            emit(["partial": lastText])
        }
        if let error {
            // After endAudio, "no speech detected" and cancellation are normal endings.
            if stopping || !lastText.isEmpty {
                finish(lastText)
            } else {
                emit(["error": error.localizedDescription])
                exit(5)
            }
        }
    }
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard status == .authorized else {
            emit(["error": "speech_denied"])
            exit(2)
        }
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            DispatchQueue.main.async {
                guard granted else {
                    emit(["error": "mic_denied"])
                    exit(2)
                }
                start()
            }
        }
    }
}

_ = signalSources
dispatchMain()
