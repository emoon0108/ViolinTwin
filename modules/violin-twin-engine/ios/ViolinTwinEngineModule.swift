import AVFoundation
import ExpoModulesCore

public class ViolinTwinEngineModule: Module {
  private let sampleRate = 44_100.0
  private let minFrequency = 180.0
  private let maxFrequency = 1_400.0
  private let frameDurationMs = Int(round((2048.0 / 44_100.0) * 1000.0))
  private var audioEngine: AVAudioEngine?
  private var streamStartTime: CFAbsoluteTime?
  private var previousPitch: Double?

  public func definition() -> ModuleDefinition {
    Name("ViolinTwinEngine")
    Events("onRealtimeFrame")

    AsyncFunction("getCapabilities") {
      return [
        "isNative": true,
        "supportsOfflinePitch": true,
        "supportsRealtimeChunk": true,
        "engineVersion": "0.2.0"
      ]
    }

    AsyncFunction("analyzePitchFrames") { (frames: [[Double]], expectedNoteLabels: [String]) in
      return self.analyzeFrames(frames: frames, expectedNoteLabels: expectedNoteLabels)
    }

    AsyncFunction("analyzeRealtimeChunk") { (samples: [Double], inputSampleRate: Double) in
      return self.buildRealtimeFrame(samples: samples, sampleRate: inputSampleRate, timestampMs: 0)
    }

    AsyncFunction("startRealtimeTracking") { (_: [[String: Any?]]) throws -> Bool in
      try self.startRealtimeTracking()
      return true
    }

    AsyncFunction("stopRealtimeTracking") {
      self.stopRealtimeTracking()
    }

    OnDestroy {
      self.stopRealtimeTracking()
    }
  }

  private func startRealtimeTracking() throws {
    stopRealtimeTracking()

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .mixWithOthers])
    try session.setPreferredSampleRate(sampleRate)
    try session.setActive(true, options: [])

    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let format = inputNode.outputFormat(forBus: 0)
    streamStartTime = CFAbsoluteTimeGetCurrent()
    previousPitch = nil

    inputNode.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
      guard let self else { return }
      let samples = self.readSamples(from: buffer)
      let timestampMs = Int(((CFAbsoluteTimeGetCurrent() - (self.streamStartTime ?? CFAbsoluteTimeGetCurrent())) * 1000.0).rounded())
      let payload = self.buildRealtimeFrame(samples: samples, sampleRate: format.sampleRate, timestampMs: timestampMs)
      self.sendEvent("onRealtimeFrame", payload)
    }

    engine.prepare()
    try engine.start()
    audioEngine = engine
  }

  private func stopRealtimeTracking() {
    audioEngine?.inputNode.removeTap(onBus: 0)
    audioEngine?.stop()
    audioEngine = nil
    previousPitch = nil
    streamStartTime = nil
  }

  private func readSamples(from buffer: AVAudioPCMBuffer) -> [Double] {
    guard let channelData = buffer.floatChannelData?[0] else { return [] }
    let frameLength = Int(buffer.frameLength)
    return (0..<frameLength).map { Double(channelData[$0]) }
  }

  private func buildRealtimeFrame(samples: [Double], sampleRate: Double, timestampMs: Int) -> [String: Any?] {
    let rms = sqrt(mean(samples.map { $0 * $0 }))
    let pitch = detectPitch(samples: samples, sampleRate: sampleRate)
    let confidence = clamp(Int(round(min(99.0, rms * 240.0 + (pitch == nil ? 0.0 : 44.0)))), min: 0, max: 99)

    guard let pitch else {
      previousPitch = nil
      return [
        "timestampMs": timestampMs,
        "pitchHz": nil,
        "centsOffset": nil,
        "noteLabel": nil,
        "confidence": confidence,
        "stability": 0
      ]
    }

    let nearest = nearestNoteFrequency(for: pitch)
    let cents = 1200.0 * log2(pitch / nearest)
    let midi = frequencyToMidi(pitch)
    let stability: Int
    if let previousPitch {
      let delta = abs(1200.0 * log2(pitch / previousPitch))
      stability = clamp(Int(round(100.0 - min(72.0, delta))), min: 22, max: 99)
    } else {
      stability = 72
    }
    self.previousPitch = pitch

    return [
      "timestampMs": timestampMs,
      "pitchHz": round(pitch * 10) / 10,
      "centsOffset": round(cents * 10) / 10,
      "noteLabel": midiToNoteLabel(midi),
      "confidence": confidence,
      "stability": stability
    ]
  }

  private func analyzeFrames(frames: [[Double]], expectedNoteLabels: [String]) -> [String: Any] {
    let pitchTrack = buildPitchTrack(frames: frames)
    let detectedNotes = segmentDetectedNotes(track: pitchTrack)
    let expectedComparisons = buildTargetComparisons(detectedNotes: detectedNotes, expectedNoteLabels: expectedNoteLabels)

    let cents = pitchTrack.compactMap { $0["centsOffset"] as? Double }
    let pitches = pitchTrack.compactMap { $0["pitchHz"] as? Double }

    if cents.isEmpty || pitches.isEmpty {
      return [
        "detectedPitchHz": NSNull(),
        "meanCentsOffset": NSNull(),
        "intonationSpread": NSNull(),
        "pitchAccuracy": 0,
        "pitchLabel": "Pitch trace unavailable",
        "dominantNoteLabel": NSNull(),
        "pitchTrack": pitchTrack,
        "detectedNotes": detectedNotes,
        "expectedNoteLabels": expectedNoteLabels,
        "targetComparisons": expectedComparisons
      ]
    }

    let meanPitch = mean(pitches)
    let meanCents = mean(cents)
    let spread = standardDeviation(cents)
    let withinTune = Double(cents.filter { abs($0) <= 18.0 }.count) / Double(cents.count)
    let perNotePenalty = detectedNotes.isEmpty
      ? 0.0
      : mean(detectedNotes.compactMap { min(40.0, abs(($0["averageCentsOffset"] as? Double) ?? 0.0)) }) * 0.35
    let targetPenalty = expectedComparisons.isEmpty
      ? 0.0
      : mean(expectedComparisons.compactMap { comparison in
          guard let cents = comparison["centsFromTarget"] as? Double else { return 40.0 }
          let notePenalty = min(36.0, abs(cents) * 0.75)
          return (comparison["matched"] as? Bool) == true ? notePenalty : notePenalty + 16.0
        })

    let pitchAccuracy = clamp(Int(round(withinTune * 100.0 - spread * 0.4 - perNotePenalty - targetPenalty * 0.5)), min: 18, max: 98)
    let dominant = dominantNoteLabel(notes: detectedNotes)

    var label = "Centered"
    if meanCents >= 7.0 {
      label = "\(Int(round(meanCents))) cents sharp"
    } else if meanCents <= -7.0 {
      label = "\(Int(round(abs(meanCents)))) cents flat"
    }

    return [
      "detectedPitchHz": round(meanPitch * 10) / 10,
      "meanCentsOffset": round(meanCents * 10) / 10,
      "intonationSpread": round(spread * 10) / 10,
      "pitchAccuracy": pitchAccuracy,
      "pitchLabel": label,
      "dominantNoteLabel": dominant ?? NSNull(),
      "pitchTrack": pitchTrack,
      "detectedNotes": detectedNotes,
      "expectedNoteLabels": expectedNoteLabels,
      "targetComparisons": expectedComparisons
    ]
  }

  private func buildPitchTrack(frames: [[Double]]) -> [[String: Any?]] {
    return frames.enumerated().map { index, frame in
      var payload = buildRealtimeFrame(samples: frame, sampleRate: sampleRate, timestampMs: index * frameDurationMs)
      payload["timestampMs"] = index * frameDurationMs
      return [
        "timeMs": index * frameDurationMs,
        "pitchHz": payload["pitchHz"] ?? nil,
        "centsOffset": payload["centsOffset"] ?? nil,
        "noteLabel": payload["noteLabel"] ?? nil
      ]
    }
  }

  private func segmentDetectedNotes(track: [[String: Any?]]) -> [[String: Any]] {
    var notes: [[String: Any]] = []
    var current: [[String: Any?]] = []
    var currentLabel: String? = nil

    func flush() {
      guard current.count >= 2, let currentLabel else {
        current = []
        currentLabel = nil
        return
      }

      let pitches = current.compactMap { $0["pitchHz"] as? Double }
      let cents = current.compactMap { $0["centsOffset"] as? Double }
      guard !pitches.isEmpty, !cents.isEmpty else {
        current = []
        currentLabel = nil
        return
      }

      notes.append([
        "noteLabel": currentLabel,
        "startMs": current.compactMap { $0["timeMs"] as? Int }.first ?? 0,
        "durationMs": current.count * frameDurationMs,
        "averagePitchHz": round(mean(pitches) * 10) / 10,
        "averageCentsOffset": round(mean(cents) * 10) / 10,
        "confidence": clamp(Int(round(100.0 - standardDeviation(cents) * 1.4)), min: 22, max: 99)
      ])

      current = []
      currentLabel = nil
    }

    for point in track {
      guard
        let label = point["noteLabel"] as? String,
        let pitch = point["pitchHz"] as? Double
      else {
        flush()
        continue
      }

      if currentLabel == nil {
        currentLabel = label
        current = [point]
        continue
      }

      if label == currentLabel {
        current.append(point)
        continue
      }

      let previousPitch = current.last?["pitchHz"] as? Double
      let delta = previousPitch != nil ? abs(1200.0 * log2(pitch / (previousPitch ?? pitch))) : 999.0

      if delta < 55.0 {
        current.append(point)
      } else {
        flush()
        currentLabel = label
        current = [point]
      }
    }

    flush()
    return notes.filter { (($0["durationMs"] as? Int) ?? 0) >= frameDurationMs * 2 }
  }

  private func buildTargetComparisons(detectedNotes: [[String: Any]], expectedNoteLabels: [String]) -> [[String: Any?]] {
    guard !expectedNoteLabels.isEmpty else {
      return []
    }

    let slicedNotes = Array(detectedNotes.prefix(expectedNoteLabels.count))
    return expectedNoteLabels.enumerated().map { index, expected in
      let played = index < slicedNotes.count ? slicedNotes[index] : nil
      let playedNoteLabel = played?["noteLabel"] as? String
      let playedPitch = played?["averagePitchHz"] as? Double
      let targetFrequency = noteLabelToFrequency(expected)
      let centsFromTarget: Double? = {
        guard let playedPitch, let targetFrequency else { return nil }
        return round((1200.0 * log2(playedPitch / targetFrequency)) * 10) / 10
      }()

      return [
        "expectedNoteLabel": expected,
        "playedNoteLabel": playedNoteLabel ?? nil,
        "centsFromTarget": centsFromTarget ?? nil,
        "matched": playedNoteLabel == expected
      ]
    }
  }

  private func detectPitch(samples: [Double], sampleRate: Double) -> Double? {
    let rms = sqrt(mean(samples.map { $0 * $0 }))
    if rms < 0.02 { return nil }

    let minOffset = Int(sampleRate / maxFrequency)
    let maxOffset = Int(sampleRate / minFrequency)
    var bestOffset = -1
    var bestCorrelation = 0.0

    for offset in minOffset...maxOffset {
      var correlation = 0.0
      if samples.count <= offset { continue }
      for index in 0..<(samples.count - offset) {
        correlation += samples[index] * samples[index + offset]
      }

      if correlation > bestCorrelation {
        bestCorrelation = correlation
        bestOffset = offset
      }
    }

    if bestOffset == -1 || bestCorrelation < 8.0 {
      return nil
    }

    return sampleRate / Double(bestOffset)
  }

  private func nearestNoteFrequency(for frequency: Double) -> Double {
    let midi = frequencyToMidi(frequency)
    return 440.0 * pow(2.0, Double(midi - 69) / 12.0)
  }

  private func frequencyToMidi(_ frequency: Double) -> Int {
    return Int(round(69.0 + 12.0 * log2(frequency / 440.0)))
  }

  private func midiToNoteLabel(_ midi: Int) -> String {
    let labels = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    let octave = Int(floor(Double(midi) / 12.0)) - 1
    return "\(labels[((midi % 12) + 12) % 12])\(octave)"
  }

  private func noteLabelToFrequency(_ label: String) -> Double? {
    let regex = try? NSRegularExpression(pattern: "^([A-G])(#?)(-?\\d)$")
    let range = NSRange(location: 0, length: label.utf16.count)
    guard
      let match = regex?.firstMatch(in: label, options: [], range: range),
      let noteRange = Range(match.range(at: 1), in: label),
      let sharpRange = Range(match.range(at: 2), in: label),
      let octaveRange = Range(match.range(at: 3), in: label)
    else {
      return nil
    }

    let semitoneMap: [String: Int] = [
      "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11
    ]
    let note = String(label[noteRange])
    let sharp = String(label[sharpRange])
    guard let octave = Int(String(label[octaveRange])), let semitone = semitoneMap[note] else {
      return nil
    }

    let midi = (octave + 1) * 12 + semitone + (sharp.isEmpty ? 0 : 1)
    return 440.0 * pow(2.0, Double(midi - 69) / 12.0)
  }

  private func dominantNoteLabel(notes: [[String: Any]]) -> String? {
    var counts: [String: Int] = [:]
    for note in notes {
      guard let label = note["noteLabel"] as? String else { continue }
      counts[label, default: 0] += 1
    }
    return counts.max(by: { $0.value < $1.value })?.key
  }

  private func mean(_ values: [Double]) -> Double {
    guard !values.isEmpty else { return 0.0 }
    return values.reduce(0.0, +) / Double(values.count)
  }

  private func standardDeviation(_ values: [Double]) -> Double {
    guard values.count > 1 else { return 0.0 }
    let avg = mean(values)
    let variance = mean(values.map { pow($0 - avg, 2.0) })
    return sqrt(variance)
  }

  private func clamp(_ value: Int, min: Int, max: Int) -> Int {
    Swift.max(min, Swift.min(max, value))
  }
}
