// dictate — streaming speech-to-text for PromptButton (macOS).
//
//   dictate [locale]     e.g. `dictate en-US`; default is the system locale
//
// Listens on the default microphone and prints one JSON object per line:
//   {"status":"listening"}            once the microphone is open
//   {"level":0.42}                    input level 0–1, about 15 times a second (for the button)
//   {"partial":"what was said so far"}
//   {"final":"the whole utterance"}   then exits 0
//   {"error":"speech_denied"|"mic_denied"|"unavailable"|"<message>"}   then exits non-zero
// Close stdin (or send SIGTERM/SIGINT) to stop listening; the final text follows within ~1 s.
//
// Recognition runs on the device when the locale supports it (requiresOnDeviceRecognition),
// so audio does not leave the Mac. The usage descriptions this needs live in an Info.plist
// embedded in the binary (desktop/native/dictate-Info.plist, linked into __TEXT,__info_plist),
// so the Electron bundle itself does not have to be modified and re-signed.
import AVFoundation
import Foundation
import Speech

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

let locale = CommandLine.arguments.count > 1 ? Locale(identifier: CommandLine.arguments[1]) : Locale.current
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

    task = recognizer.recognitionTask(with: request) { result, error in
        if let result {
            lastText = result.bestTranscription.formattedString
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
