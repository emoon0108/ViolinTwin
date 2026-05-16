package expo.modules.violintwinengine

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sqrt

class ViolinTwinEngineModule : Module() {
  private val sampleRate = 44_100
  private val minFrequency = 180.0
  private val maxFrequency = 1_400.0
  private val frameDurationMs = round((2048.0 / 44_100.0) * 1000.0).toInt()
  @Volatile private var realtimeRunning = false
  private var realtimeRecord: AudioRecord? = null
  private var realtimeThread: Thread? = null
  private var previousPitch: Double? = null
  private var streamStartMs: Long = 0L

  override fun definition() = ModuleDefinition {
    Name("ViolinTwinEngine")
    Events("onRealtimeFrame")

    AsyncFunction("getCapabilities") {
      mapOf(
        "isNative" to true,
        "supportsOfflinePitch" to true,
        "supportsRealtimeChunk" to true,
        "engineVersion" to "0.2.0"
      )
    }

    AsyncFunction("analyzePitchFrames") { frames: List<List<Double>>, expectedNoteLabels: List<String> ->
      analyzeFrames(frames, expectedNoteLabels)
    }

    AsyncFunction("analyzeRealtimeChunk") { samples: List<Double>, inputSampleRate: Double ->
      buildRealtimeFrame(samples, inputSampleRate, 0)
    }

    AsyncFunction("startRealtimeTracking") { _: List<Map<String, Any?>> ->
      startRealtimeTracking()
      true
    }

    AsyncFunction("stopRealtimeTracking") {
      stopRealtimeTracking()
    }

    OnDestroy {
      stopRealtimeTracking()
    }
  }

  private fun startRealtimeTracking() {
    stopRealtimeTracking()

    val minBuffer = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val bufferSize = maxOf(minBuffer, 4096)
    val recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferSize
    )

    realtimeRecord = recorder
    realtimeRunning = true
    previousPitch = null
    streamStartMs = System.currentTimeMillis()
    recorder.startRecording()

    realtimeThread = thread(start = true, name = "ViolinTwinRealtime") {
      val shortBuffer = ShortArray(2048)
      while (realtimeRunning) {
        val read = recorder.read(shortBuffer, 0, shortBuffer.size)
        if (read <= 0) {
          continue
        }

        val samples = DoubleArray(read) { index -> shortBuffer[index] / Short.MAX_VALUE.toDouble() }.toList()
        val timestampMs = (System.currentTimeMillis() - streamStartMs).toInt()
        sendEvent("onRealtimeFrame", buildRealtimeFrame(samples, sampleRate.toDouble(), timestampMs))
      }
    }
  }

  private fun stopRealtimeTracking() {
    realtimeRunning = false
    realtimeThread?.interrupt()
    realtimeThread = null
    realtimeRecord?.runCatching {
      stop()
      release()
    }
    realtimeRecord = null
    previousPitch = null
  }

  private fun buildRealtimeFrame(samples: List<Double>, inputSampleRate: Double, timestampMs: Int): Map<String, Any?> {
    val rms = sqrt(mean(samples.map { it * it }))
    val pitch = detectPitch(samples, inputSampleRate)
    val confidence = clamp(round(minOf(99.0, rms * 240.0 + if (pitch == null) 0.0 else 44.0)).toInt(), 0, 99)

    if (pitch == null) {
      previousPitch = null
      return mapOf(
        "timestampMs" to timestampMs,
        "pitchHz" to null,
        "centsOffset" to null,
        "noteLabel" to null,
        "confidence" to confidence,
        "stability" to 0
      )
    }

    val nearest = nearestNoteFrequency(pitch)
    val cents = 1200.0 * log2(pitch / nearest)
    val stability = previousPitch?.let { prior ->
      val delta = abs(1200.0 * log2(pitch / prior))
      clamp(round(100.0 - minOf(72.0, delta)).toInt(), 22, 99)
    } ?: 72
    previousPitch = pitch

    return mapOf(
      "timestampMs" to timestampMs,
      "pitchHz" to round(pitch * 10.0) / 10.0,
      "centsOffset" to round(cents * 10.0) / 10.0,
      "noteLabel" to midiToNoteLabel(frequencyToMidi(pitch)),
      "confidence" to confidence,
      "stability" to stability
    )
  }

  private fun analyzeFrames(frames: List<List<Double>>, expectedNoteLabels: List<String>): Map<String, Any?> {
    val pitchTrack = buildPitchTrack(frames)
    val detectedNotes = segmentDetectedNotes(pitchTrack)
    val targetComparisons = buildTargetComparisons(detectedNotes, expectedNoteLabels)
    val cents = pitchTrack.mapNotNull { it["centsOffset"] as? Double }
    val pitches = pitchTrack.mapNotNull { it["pitchHz"] as? Double }

    if (cents.isEmpty() || pitches.isEmpty()) {
      return mapOf(
        "detectedPitchHz" to null,
        "meanCentsOffset" to null,
        "intonationSpread" to null,
        "pitchAccuracy" to 0,
        "pitchLabel" to "Pitch trace unavailable",
        "dominantNoteLabel" to null,
        "pitchTrack" to pitchTrack,
        "detectedNotes" to detectedNotes,
        "expectedNoteLabels" to expectedNoteLabels,
        "targetComparisons" to targetComparisons
      )
    }

    val meanPitch = mean(pitches)
    val meanCents = mean(cents)
    val spread = standardDeviation(cents)
    val withinTune = cents.count { abs(it) <= 18.0 }.toDouble() / cents.size.toDouble()
    val perNotePenalty =
      if (detectedNotes.isEmpty()) 0.0
      else mean(detectedNotes.map { minOf(40.0, abs((it["averageCentsOffset"] as? Double) ?: 0.0)) }) * 0.35
    val targetPenalty =
      if (targetComparisons.isEmpty()) 0.0
      else mean(targetComparisons.map {
        val centsFromTarget = it["centsFromTarget"] as? Double
        if (centsFromTarget == null) {
          40.0
        } else {
          val notePenalty = minOf(36.0, abs(centsFromTarget) * 0.75)
          if ((it["matched"] as? Boolean) == true) notePenalty else notePenalty + 16.0
        }
      })

    val pitchAccuracy = clamp(round(withinTune * 100.0 - spread * 0.4 - perNotePenalty - targetPenalty * 0.5).toInt(), 18, 98)
    val dominant = dominantNoteLabel(detectedNotes)
    val label = when {
      meanCents >= 7.0 -> "${round(meanCents).toInt()} cents sharp"
      meanCents <= -7.0 -> "${round(abs(meanCents)).toInt()} cents flat"
      else -> "Centered"
    }

    return mapOf(
      "detectedPitchHz" to round(meanPitch * 10.0) / 10.0,
      "meanCentsOffset" to round(meanCents * 10.0) / 10.0,
      "intonationSpread" to round(spread * 10.0) / 10.0,
      "pitchAccuracy" to pitchAccuracy,
      "pitchLabel" to label,
      "dominantNoteLabel" to dominant,
      "pitchTrack" to pitchTrack,
      "detectedNotes" to detectedNotes,
      "expectedNoteLabels" to expectedNoteLabels,
      "targetComparisons" to targetComparisons
    )
  }

  private fun buildPitchTrack(frames: List<List<Double>>): List<Map<String, Any?>> {
    return frames.mapIndexed { index, frame ->
      val payload = buildRealtimeFrame(frame, sampleRate.toDouble(), index * frameDurationMs)
      mapOf(
        "timeMs" to index * frameDurationMs,
        "pitchHz" to payload["pitchHz"],
        "centsOffset" to payload["centsOffset"],
        "noteLabel" to payload["noteLabel"]
      )
    }
  }

  private fun segmentDetectedNotes(track: List<Map<String, Any?>>): List<Map<String, Any>> {
    val notes = mutableListOf<Map<String, Any>>()
    val current = mutableListOf<Map<String, Any?>>()
    var currentLabel: String? = null

    fun flush() {
      if (current.size < 2 || currentLabel == null) {
        current.clear()
        currentLabel = null
        return
      }

      val pitches = current.mapNotNull { it["pitchHz"] as? Double }
      val cents = current.mapNotNull { it["centsOffset"] as? Double }
      if (pitches.isEmpty() || cents.isEmpty()) {
        current.clear()
        currentLabel = null
        return
      }

      notes.add(
        mapOf(
          "noteLabel" to currentLabel!!,
          "startMs" to (current.first()["timeMs"] as? Int ?: 0),
          "durationMs" to current.size * frameDurationMs,
          "averagePitchHz" to round(mean(pitches) * 10.0) / 10.0,
          "averageCentsOffset" to round(mean(cents) * 10.0) / 10.0,
          "confidence" to clamp(round(100.0 - standardDeviation(cents) * 1.4).toInt(), 22, 99)
        )
      )

      current.clear()
      currentLabel = null
    }

    for (point in track) {
      val label = point["noteLabel"] as? String
      val pitch = point["pitchHz"] as? Double
      if (label == null || pitch == null) {
        flush()
        continue
      }

      if (currentLabel == null) {
        currentLabel = label
        current.add(point)
        continue
      }

      if (label == currentLabel) {
        current.add(point)
        continue
      }

      val previousPitch = current.lastOrNull()?.get("pitchHz") as? Double
      val delta = if (previousPitch != null) abs(1200.0 * log2(pitch / previousPitch)) else 999.0
      if (delta < 55.0) {
        current.add(point)
      } else {
        flush()
        currentLabel = label
        current.add(point)
      }
    }

    flush()
    return notes.filter { ((it["durationMs"] as? Int) ?: 0) >= frameDurationMs * 2 }
  }

  private fun buildTargetComparisons(
    detectedNotes: List<Map<String, Any>>,
    expectedNoteLabels: List<String>
  ): List<Map<String, Any?>> {
    if (expectedNoteLabels.isEmpty()) {
      return emptyList()
    }

    val sliced = detectedNotes.take(expectedNoteLabels.size)
    return expectedNoteLabels.mapIndexed { index, expected ->
      val played = sliced.getOrNull(index)
      val playedNoteLabel = played?.get("noteLabel") as? String
      val playedPitch = played?.get("averagePitchHz") as? Double
      val targetFrequency = noteLabelToFrequency(expected)
      val centsFromTarget: Double? =
        if (playedPitch == null || targetFrequency == null) null
        else round((1200.0 * log2(playedPitch / targetFrequency)) * 10.0) / 10.0

      mapOf(
        "expectedNoteLabel" to expected,
        "playedNoteLabel" to playedNoteLabel,
        "centsFromTarget" to centsFromTarget,
        "matched" to (playedNoteLabel == expected)
      )
    }
  }

  private fun detectPitch(samples: List<Double>, sampleRate: Double): Double? {
    val rms = sqrt(mean(samples.map { it * it }))
    if (rms < 0.02) {
      return null
    }

    val minOffset = (sampleRate / maxFrequency).toInt()
    val maxOffset = (sampleRate / minFrequency).toInt()
    var bestOffset = -1
    var bestCorrelation = 0.0

    for (offset in minOffset..maxOffset) {
      var correlation = 0.0
      if (samples.size <= offset) continue
      for (index in 0 until (samples.size - offset)) {
        correlation += samples[index] * samples[index + offset]
      }

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation
        bestOffset = offset
      }
    }

    if (bestOffset == -1 || bestCorrelation < 8.0) {
      return null
    }

    return sampleRate / bestOffset.toDouble()
  }

  private fun nearestNoteFrequency(frequency: Double): Double {
    val midi = frequencyToMidi(frequency)
    return 440.0 * 2.0.pow((midi - 69) / 12.0)
  }

  private fun frequencyToMidi(frequency: Double): Int {
    return round(69.0 + 12.0 * log2(frequency / 440.0)).toInt()
  }

  private fun midiToNoteLabel(midi: Int): String {
    val labels = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    val octave = kotlin.math.floor(midi / 12.0).toInt() - 1
    return "${labels[((midi % 12) + 12) % 12]}$octave"
  }

  private fun noteLabelToFrequency(label: String): Double? {
    val match = Regex("^([A-G])(#?)(-?\\d)$").find(label) ?: return null
    val semitoneMap = mapOf(
      "C" to 0,
      "D" to 2,
      "E" to 4,
      "F" to 5,
      "G" to 7,
      "A" to 9,
      "B" to 11
    )
    val note = match.groupValues[1]
    val sharp = match.groupValues[2]
    val octave = match.groupValues[3].toIntOrNull() ?: return null
    val semitone = semitoneMap[note] ?: return null
    val midi = (octave + 1) * 12 + semitone + if (sharp.isEmpty()) 0 else 1
    return 440.0 * 2.0.pow((midi - 69) / 12.0)
  }

  private fun dominantNoteLabel(notes: List<Map<String, Any>>): String? {
    val counts = mutableMapOf<String, Int>()
    notes.forEach { note ->
      val label = note["noteLabel"] as? String ?: return@forEach
      counts[label] = (counts[label] ?: 0) + 1
    }
    return counts.maxByOrNull { it.value }?.key
  }

  private fun mean(values: List<Double>): Double {
    if (values.isEmpty()) return 0.0
    return values.sum() / values.size.toDouble()
  }

  private fun standardDeviation(values: List<Double>): Double {
    if (values.size < 2) return 0.0
    val avg = mean(values)
    val variance = mean(values.map { (it - avg) * (it - avg) })
    return sqrt(variance)
  }

  private fun clamp(value: Int, min: Int, max: Int): Int = maxOf(min, minOf(max, value))
}
