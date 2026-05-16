import {
  DetectedNote,
  ExpectedTargetNote,
  FixLoopIssue,
  LiveScoreFollower,
  LiveTunerFrame,
  PitchTrackPoint,
  PracticeTarget,
  PracticeMode,
  ScaleTargetId,
  SessionAnalysis,
  TargetComparison,
  TwinProfile
} from "../types/violin";
import { SCALE_TARGETS } from "./practiceTargets";

const SAMPLE_RATE = 44100;
const MIN_VIOLIN_FREQ = 180;
const MAX_VIOLIN_FREQ = 1400;
const FRAME_DURATION_MS = Math.round((2048 / SAMPLE_RATE) * 1000);

type PitchSummary = {
  detectedPitchHz: number | null;
  meanCentsOffset: number | null;
  intonationSpread: number | null;
  pitchAccuracy: number;
  pitchLabel: string;
  dominantNoteLabel: string | null;
  pitchTrack: PitchTrackPoint[];
  detectedNotes: DetectedNote[];
  targetComparisons: TargetComparison[];
  expectedNoteLabels: string[];
  expectedNotes: ExpectedTargetNote[];
};

export type EnginePitchSummary = {
  detectedPitchHz: number | null;
  meanCentsOffset: number | null;
  intonationSpread: number | null;
  pitchAccuracy: number;
  pitchLabel: string;
  dominantNoteLabel: string | null;
  pitchTrack: PitchTrackPoint[];
  detectedNotes: DetectedNote[];
  targetComparisons: TargetComparison[];
  expectedNoteLabels: string[];
  expectedNotes: ExpectedTargetNote[];
};

type RhythmSummary = {
  detectedTempoBpm: number | null;
  rhythmStability: number;
  rhythmLabel: string;
};

type BowSummary = {
  bowControl: number;
  bowLabel: string;
};

type TimbreSummary = {
  timbreBrightness: number;
  timbreStability: number;
  timbreLabel: string;
  timbreInsights: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function meterToNormalized(db: number | undefined) {
  if (db === undefined || Number.isNaN(db)) {
    return 0.04;
  }

  return clamp((db + 60) / 60, 0.04, 1);
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function nearestNoteFrequency(freq: number) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return 440 * 2 ** ((midi - 69) / 12);
}

function midiToNoteLabel(midi: number) {
  const labels = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${labels[((midi % 12) + 12) % 12]}${octave}`;
}

function frequencyToMidi(freq: number) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function noteLabelToFrequency(noteLabel: string) {
  const match = noteLabel.match(/^([A-G])(#?)(-?\d)$/);
  if (!match) {
    return null;
  }

  const [, letter, sharp, octaveRaw] = match;
  const semitoneMap: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
  };
  const octave = Number(octaveRaw);
  const midi = (octave + 1) * 12 + semitoneMap[letter] + (sharp ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

function detectPitchAutocorrelation(buffer: number[], sampleRate: number) {
  const rms = Math.sqrt(mean(buffer.map((value) => value * value)));
  if (rms < 0.02) {
    return null;
  }

  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / MAX_VIOLIN_FREQ);
  const maxOffset = Math.floor(sampleRate / MIN_VIOLIN_FREQ);

  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;

    for (let i = 0; i < buffer.length - offset; i += 1) {
      correlation += buffer[i] * buffer[i + offset];
    }

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestOffset === -1 || bestCorrelation < 8) {
    return null;
  }

  return sampleRate / bestOffset;
}

function buildPitchTrack(sampleFrames: number[][]) {
  const pitchTrack: PitchTrackPoint[] = [];

  sampleFrames.forEach((frames, index) => {
    const pitch = detectPitchAutocorrelation(frames, SAMPLE_RATE);
    if (!pitch) {
      pitchTrack.push({
        timeMs: index * FRAME_DURATION_MS,
        pitchHz: null,
        centsOffset: null,
        noteLabel: null
      });
      return;
    }

    const midi = frequencyToMidi(pitch);
    const nearest = nearestNoteFrequency(pitch);
    const cents = 1200 * Math.log2(pitch / nearest);

    pitchTrack.push({
      timeMs: index * FRAME_DURATION_MS,
      pitchHz: Number(pitch.toFixed(1)),
      centsOffset: Number(cents.toFixed(1)),
      noteLabel: midiToNoteLabel(midi)
    });
  });

  return pitchTrack;
}

function segmentDetectedNotes(track: PitchTrackPoint[]) {
  const notes: DetectedNote[] = [];
  let current: PitchTrackPoint[] = [];
  let currentLabel: string | null = null;

  function flush() {
    if (current.length < 2 || !currentLabel) {
      current = [];
      currentLabel = null;
      return;
    }

    const pitches = current.map((point) => point.pitchHz ?? 0).filter(Boolean);
    const cents = current.map((point) => point.centsOffset ?? 0);
    const durationMs = current.length * FRAME_DURATION_MS;

    notes.push({
      noteLabel: currentLabel,
      startMs: current[0].timeMs,
      durationMs,
      averagePitchHz: Number(mean(pitches).toFixed(1)),
      averageCentsOffset: Number(mean(cents).toFixed(1)),
      confidence: clamp(Math.round(100 - standardDeviation(cents) * 1.4), 22, 99)
    });

    current = [];
    currentLabel = null;
  }

  track.forEach((point) => {
    if (!point.noteLabel || point.pitchHz === null || point.centsOffset === null) {
      flush();
      return;
    }

    if (currentLabel === null) {
      currentLabel = point.noteLabel;
      current = [point];
      return;
    }

    if (point.noteLabel === currentLabel) {
      current.push(point);
      return;
    }

    const priorPitch = current[current.length - 1]?.pitchHz;
    const pitchDelta = priorPitch && point.pitchHz ? Math.abs(1200 * Math.log2(point.pitchHz / priorPitch)) : 999;

    if (pitchDelta < 55) {
      current.push(point);
      return;
    }

    flush();
    currentLabel = point.noteLabel;
    current = [point];
  });

  flush();
  return notes.filter((note) => note.durationMs >= FRAME_DURATION_MS * 2);
}

export function alignDetectedToTarget(
  detectedNotes: DetectedNote[],
  expectedNotes: ExpectedTargetNote[],
  performedDurationMs: number
) {
  if (expectedNotes.length === 0) {
    return {
      expectedNotes: [] as ExpectedTargetNote[],
      expectedNoteLabels: [] as string[],
      targetComparisons: [] as TargetComparison[]
    };
  }

  const targetDurationMs =
    expectedNotes[expectedNotes.length - 1]!.startMs + expectedNotes[expectedNotes.length - 1]!.durationMs;
  const scale = targetDurationMs > 0 ? performedDurationMs / targetDurationMs : 1;
  const normalizedExpected = expectedNotes.map((note) => ({
    ...note,
    startMs: Math.round(note.startMs * scale),
    durationMs: Math.max(120, Math.round(note.durationMs * scale))
  }));

  const m = normalizedExpected.length;
  const n = detectedNotes.length;
  const dp = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => Number.POSITIVE_INFINITY));
  const choice = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => ""));
  dp[0][0] = 0;

  for (let i = 0; i <= m; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      const current = dp[i][j];
      if (!Number.isFinite(current)) {
        continue;
      }

      if (i < m) {
        const skipTargetCost = current + 34;
        if (skipTargetCost < dp[i + 1][j]) {
          dp[i + 1][j] = skipTargetCost;
          choice[i + 1][j] = "skipTarget";
        }
      }

      if (j < n) {
        const skipPlayedCost = current + 18;
        if (skipPlayedCost < dp[i][j + 1]) {
          dp[i][j + 1] = skipPlayedCost;
          choice[i][j + 1] = "skipPlayed";
        }
      }

      if (i < m && j < n) {
        const expected = normalizedExpected[i]!;
        const played = detectedNotes[j]!;
        const targetFrequency = noteLabelToFrequency(expected.noteLabel);
        const centsFromTarget = targetFrequency
          ? 1200 * Math.log2(played.averagePitchHz / targetFrequency)
          : 0;
        const timingDelta = played.startMs - expected.startMs;
        const noteMismatchPenalty = played.noteLabel === expected.noteLabel ? 0 : 16;
        const centsPenalty = Math.min(32, Math.abs(centsFromTarget) * 0.5);
        const timingPenalty = Math.min(26, Math.abs(timingDelta) / 45);
        const durationPenalty = Math.min(12, Math.abs(played.durationMs - expected.durationMs) / 80);
        const totalCost = current + noteMismatchPenalty + centsPenalty + timingPenalty + durationPenalty;

        if (totalCost < dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = totalCost;
          choice[i + 1][j + 1] = "match";
        }
      }
    }
  }

  const matchedNotes = new Map<number, number>();
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const step = choice[i][j];
    if (step === "match") {
      matchedNotes.set(i - 1, j - 1);
      i -= 1;
      j -= 1;
    } else if (step === "skipTarget") {
      i -= 1;
    } else if (step === "skipPlayed") {
      j -= 1;
    } else {
      break;
    }
  }

  const comparisons = normalizedExpected.map((expected, index) => {
    const playedIndex = matchedNotes.get(index);
    const played = playedIndex !== undefined ? detectedNotes[playedIndex] : null;
    const targetFrequency = noteLabelToFrequency(expected.noteLabel);
    const centsFromTarget =
      played && targetFrequency
        ? Number((1200 * Math.log2(played.averagePitchHz / targetFrequency)).toFixed(1))
        : null;
    const timingDeltaMs = played ? played.startMs - expected.startMs : null;
    let rhythmicLabel = "Missing or unmatched note";
    if (timingDeltaMs !== null) {
      if (Math.abs(timingDeltaMs) <= 70) {
        rhythmicLabel = expected.subdivisionLabel === "downbeat" ? "On the beat" : `Clean ${expected.subdivisionLabel} subdivision`;
      } else if (timingDeltaMs < -70) {
        rhythmicLabel =
          expected.subdivisionLabel === "downbeat" ? "Early entrance" : `Rushing the ${expected.subdivisionLabel}`;
      } else {
        rhythmicLabel =
          expected.subdivisionLabel === "downbeat" ? "Late entrance" : `Late on the ${expected.subdivisionLabel}`;
      }
    }

    return {
      expectedNoteLabel: expected.noteLabel,
      playedNoteLabel: played?.noteLabel ?? null,
      centsFromTarget,
      matched: played?.noteLabel === expected.noteLabel,
      expectedStartMs: expected.startMs,
      playedStartMs: played?.startMs ?? null,
      timingDeltaMs,
      measureNumber: expected.measureNumber,
      beatInMeasure: expected.beatInMeasure,
      subdivisionLabel: expected.subdivisionLabel,
      rhythmicLabel
    } satisfies TargetComparison;
  });

  return {
    expectedNotes: normalizedExpected,
    expectedNoteLabels: normalizedExpected.map((note) => note.noteLabel),
    targetComparisons: comparisons
  };
}

export function summarizePitch(
  sampleFrames: number[][],
  target: PracticeTarget | null
): PitchSummary {
  const pitchTrack = buildPitchTrack(sampleFrames);
  const detectedNotes = segmentDetectedNotes(pitchTrack);
  const performedDurationMs =
    detectedNotes[detectedNotes.length - 1]?.startMs !== undefined
      ? detectedNotes[detectedNotes.length - 1]!.startMs + detectedNotes[detectedNotes.length - 1]!.durationMs
      : 0;
  const { expectedNoteLabels, expectedNotes, targetComparisons } = alignDetectedToTarget(
    detectedNotes,
    target?.expectedNotes ?? [],
    performedDurationMs
  );
  const pitches = pitchTrack.map((point) => point.pitchHz).filter((value): value is number => value !== null);
  const centsOffsets = pitchTrack
    .map((point) => point.centsOffset)
    .filter((value): value is number => value !== null);

  if (pitches.length === 0 || centsOffsets.length === 0) {
    return {
      detectedPitchHz: null,
      meanCentsOffset: null,
      intonationSpread: null,
      pitchAccuracy: 0,
      pitchLabel: "Pitch trace unavailable",
      dominantNoteLabel: null,
      pitchTrack,
      detectedNotes,
      expectedNotes,
      expectedNoteLabels,
      targetComparisons
    };
  }

  const avgPitch = mean(pitches);
  const avgCents = mean(centsOffsets);
  const spread = standardDeviation(centsOffsets);
  const withinTune = centsOffsets.filter((value) => Math.abs(value) <= 18).length / centsOffsets.length;
  const perNotePenalty = detectedNotes.length
    ? mean(detectedNotes.map((note) => Math.min(40, Math.abs(note.averageCentsOffset)))) * 0.35
    : 0;
  const targetPenalty =
    targetComparisons.length > 0
      ? mean(
          targetComparisons.map((comparison) => {
            if (!comparison.playedNoteLabel || comparison.centsFromTarget === null) {
              return 40;
            }
            const notePenalty = Math.min(36, Math.abs(comparison.centsFromTarget) * 0.75);
            return comparison.matched ? notePenalty : notePenalty + 16;
          })
        )
      : 0;
  const accuracy = clamp(Math.round(withinTune * 100 - spread * 0.4 - perNotePenalty - targetPenalty * 0.5), 18, 98);

  const noteCounts = new Map<string, number>();
  detectedNotes.forEach((note) => {
    noteCounts.set(note.noteLabel, (noteCounts.get(note.noteLabel) ?? 0) + 1);
  });
  const dominantNoteLabel = Array.from(noteCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let label = "Centered";
  if (avgCents >= 7) {
    label = `${Math.round(avgCents)} cents sharp`;
  } else if (avgCents <= -7) {
    label = `${Math.abs(Math.round(avgCents))} cents flat`;
  }

  return {
    detectedPitchHz: Number(avgPitch.toFixed(1)),
    meanCentsOffset: Number(avgCents.toFixed(1)),
    intonationSpread: Number(spread.toFixed(1)),
    pitchAccuracy: accuracy,
    pitchLabel: label,
    dominantNoteLabel,
    pitchTrack,
    detectedNotes,
    expectedNotes,
    expectedNoteLabels,
    targetComparisons
  };
}

function summarizeTargetRhythm(targetComparisons: TargetComparison[]) {
  const matched = targetComparisons.filter((comparison) => comparison.timingDeltaMs !== null);
  if (matched.length < 3) {
    return null;
  }

  const offbeats = matched.filter((comparison) => comparison.subdivisionLabel !== "downbeat");
  const rushingOffbeats = offbeats.filter((comparison) => (comparison.timingDeltaMs ?? 0) < -70);
  const lateDownbeats = matched.filter(
    (comparison) => comparison.subdivisionLabel === "downbeat" && (comparison.timingDeltaMs ?? 0) > 90
  );
  const weakBarRecovery = matched.filter(
    (comparison) =>
      comparison.subdivisionLabel === "downbeat" &&
      comparison.beatInMeasure === 1 &&
      Math.abs(comparison.timingDeltaMs ?? 0) > 90
  );

  const avgTimingError =
    matched.reduce((sum, comparison) => sum + Math.abs(comparison.timingDeltaMs ?? 0), 0) / matched.length;
  const matchRatio = matched.length / targetComparisons.length;
  const timingScore = clamp(Math.round(100 - avgTimingError * 0.5 - (1 - matchRatio) * 42), 20, 98);

  let rhythmLabel = "Beat-aware alignment stable";
  if (rushingOffbeats.length >= Math.max(2, Math.floor(offbeats.length * 0.45))) {
    rhythmLabel = "Rushing eighth-note subdivisions";
  } else if (lateDownbeats.length >= 2) {
    rhythmLabel = "Late downbeats";
  } else if (weakBarRecovery.length >= 2) {
    rhythmLabel = "Weak bar-line recovery";
  } else if (avgTimingError > 110) {
    rhythmLabel = "Subdivision timing uneven";
  }

  return {
    timingScore,
    rhythmLabel
  };
}

export function summarizeRhythm(
  meterSeries: number[],
  sampleIntervalMs: number,
  targetComparisons: TargetComparison[] = []
): RhythmSummary {
  const normalized = meterSeries.map((value) => clamp(value, 0, 1));
  if (normalized.length < 8) {
    return {
      detectedTempoBpm: null,
      rhythmStability: 0,
      rhythmLabel: "Not enough motion data"
    };
  }

  const threshold = Math.max(0.24, mean(normalized) + standardDeviation(normalized) * 0.45);
  const onsetTimes: number[] = [];

  for (let i = 1; i < normalized.length - 1; i += 1) {
    const current = normalized[i];
    const previous = normalized[i - 1];
    const next = normalized[i + 1];
    const lastOnset = onsetTimes[onsetTimes.length - 1] ?? -999;
    const time = (i * sampleIntervalMs) / 1000;

    if (current > threshold && current >= previous && current >= next && time - lastOnset > 0.28) {
      onsetTimes.push(time);
    }
  }

  const intervals = onsetTimes
    .slice(1)
    .map((time, index) => time - onsetTimes[index])
    .filter((value) => value >= 0.28 && value <= 1.5);

  if (intervals.length === 0) {
    return {
      detectedTempoBpm: null,
      rhythmStability: 42,
      rhythmLabel: "Pulse not stable enough yet"
    };
  }

  const bpmValues = intervals.map((value) => 60 / value);
  const tempo = median(bpmValues);
  const stabilityRatio = standardDeviation(intervals) / mean(intervals);
  const stability = clamp(Math.round(100 - stabilityRatio * 190), 24, 98);
  const startAverage = mean(intervals.slice(0, Math.max(1, Math.floor(intervals.length / 2))));
  const endAverage = mean(intervals.slice(Math.floor(intervals.length / 2)));
  const driftRatio = endAverage / startAverage;

  let label = "Stable";
  if (driftRatio < 0.95) {
    label = "Slightly rushing";
  } else if (driftRatio > 1.05) {
    label = "Dragging slightly";
  } else if (stability < 70) {
    label = "Uneven pulse";
  }

  const targetRhythm = summarizeTargetRhythm(targetComparisons);
  const finalStability = targetRhythm
    ? clamp(Math.round(stability * 0.55 + targetRhythm.timingScore * 0.45), 20, 98)
    : stability;
  const finalLabel = targetRhythm?.rhythmLabel ?? label;

  return {
    detectedTempoBpm: tempo ? Math.round(tempo) : null,
    rhythmStability: finalStability,
    rhythmLabel: finalLabel
  };
}

function estimateSpectralFeatures(frame: number[]) {
  if (frame.length < 16) {
    return null;
  }

  const energy = Math.sqrt(mean(frame.map((sample) => sample * sample)));
  if (energy < 0.01) {
    return null;
  }

  const spectrumBins = 96;
  let magnitudeSum = 0;
  let weightedFrequencySum = 0;
  let highBandMagnitude = 0;
  let rolloffFrequency = 0;
  const magnitudes: number[] = [];
  const nyquist = SAMPLE_RATE / 2;

  for (let bin = 1; bin <= spectrumBins; bin += 1) {
    const frequency = (bin / spectrumBins) * nyquist;
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const sample = frame[index]!;
      const phase = (2 * Math.PI * bin * index) / frame.length;
      real += sample * Math.cos(phase);
      imaginary -= sample * Math.sin(phase);
    }

    const magnitude = Math.sqrt(real * real + imaginary * imaginary);
    magnitudes.push(magnitude);
    magnitudeSum += magnitude;
    weightedFrequencySum += magnitude * frequency;
    if (frequency >= 2200) {
      highBandMagnitude += magnitude;
    }
  }

  if (magnitudeSum <= 0) {
    return null;
  }

  let cumulative = 0;
  const rolloffThreshold = magnitudeSum * 0.85;
  for (let index = 0; index < magnitudes.length; index += 1) {
    cumulative += magnitudes[index]!;
    if (cumulative >= rolloffThreshold) {
      rolloffFrequency = ((index + 1) / spectrumBins) * nyquist;
      break;
    }
  }

  const zeroCrossings = frame.slice(1).reduce((count, sample, index) => {
    const previous = frame[index]!;
    return previous === 0 || sample === 0 || Math.sign(previous) === Math.sign(sample) ? count : count + 1;
  }, 0);

  return {
    centroidHz: weightedFrequencySum / magnitudeSum,
    rolloffHz: rolloffFrequency || nyquist * 0.5,
    highBandRatio: highBandMagnitude / magnitudeSum,
    zeroCrossingRate: zeroCrossings / frame.length
  };
}

export function summarizeTimbre(sampleFrames: number[][]): TimbreSummary {
  const features = sampleFrames.map(estimateSpectralFeatures).filter((value): value is NonNullable<typeof value> => value !== null);
  if (features.length < 4) {
    return {
      timbreBrightness: 0,
      timbreStability: 0,
      timbreLabel: "Tone trace unavailable",
      timbreInsights: ["Record a longer sustained phrase to estimate tone color and stability."]
    };
  }

  const centroidMean = mean(features.map((feature) => feature.centroidHz));
  const centroidStd = standardDeviation(features.map((feature) => feature.centroidHz));
  const rolloffMean = mean(features.map((feature) => feature.rolloffHz));
  const highBandRatioMean = mean(features.map((feature) => feature.highBandRatio));
  const zeroCrossingMean = mean(features.map((feature) => feature.zeroCrossingRate));

  const brightness = clamp(
    Math.round((centroidMean / 28) * 0.6 + highBandRatioMean * 160 + (rolloffMean / 120) * 0.4),
    18,
    98
  );
  const stability = clamp(
    Math.round(100 - centroidStd / 22 - highBandRatioMean * 24 - zeroCrossingMean * 120),
    20,
    97
  );

  let timbreLabel = "Balanced core tone";
  if (brightness >= 74 && stability >= 70) {
    timbreLabel = "Brilliant and resonant";
  } else if (brightness >= 74) {
    timbreLabel = "Bright but edgy";
  } else if (brightness <= 42 && stability >= 72) {
    timbreLabel = "Dark and covered";
  } else if (stability <= 56) {
    timbreLabel = "Tone color unstable";
  }

  const insights: string[] = [];
  if (brightness >= 76) {
    insights.push("Upper partials are dominating. Relax bow pressure slightly so the tone opens without turning glassy.");
  } else if (brightness <= 44) {
    insights.push("The spectrum is heavily centered in the low partials. Move a little closer to the bridge for more brilliance.");
  } else {
    insights.push("The spectral balance is fairly centered. Keep matching contact point and arm weight through each bow lane.");
  }

  if (stability <= 58) {
    insights.push("Tone color varies from note to note. Sustain longer bows and stabilize contact point before adding speed.");
  } else {
    insights.push("Tone color stays relatively consistent across the phrase. Preserve that consistency during string crossings.");
  }

  if (zeroCrossingMean >= 0.18) {
    insights.push("There is extra high-frequency noise in the attacks, which can read as surface scratch in softer passages.");
  }

  return {
    timbreBrightness: brightness,
    timbreStability: stability,
    timbreLabel,
    timbreInsights: insights.slice(0, 3)
  };
}

export function summarizeBowControl(meterSeries: number[]): BowSummary {
  if (meterSeries.length < 8) {
    return {
      bowControl: 0,
      bowLabel: "Not enough bow data"
    };
  }

  const deltas = meterSeries.slice(1).map((value, index) => Math.abs(value - meterSeries[index]));
  const dynamicsStd = standardDeviation(meterSeries);
  const transitionRoughness = mean(deltas);
  const control = clamp(Math.round(100 - dynamicsStd * 55 - transitionRoughness * 120), 26, 96);

  let label = "Stable";
  if (transitionRoughness > 0.18) {
    label = "Pressure spikes detected";
  } else if (dynamicsStd > 0.22) {
    label = "Bow drift under soft notes";
  }

  return {
    bowControl: control,
    bowLabel: label
  };
}

export function buildCorrections(
  pitch: PitchSummary,
  rhythm: RhythmSummary,
  bow: BowSummary,
  timbre: TimbreSummary,
  mode: PracticeMode
) {
  const corrections: string[] = [];
  const worstTarget = [...pitch.targetComparisons]
    .filter((comparison) => comparison.centsFromTarget !== null)
    .sort((a, b) => Math.abs((b.centsFromTarget ?? 0)) - Math.abs((a.centsFromTarget ?? 0)))[0];
  const unstableNote = [...pitch.detectedNotes].sort(
    (a, b) => Math.abs(b.averageCentsOffset) - Math.abs(a.averageCentsOffset)
  )[0];

  if (worstTarget && worstTarget.centsFromTarget !== null && Math.abs(worstTarget.centsFromTarget) > 10) {
    corrections.push(
      `${worstTarget.expectedNoteLabel} landed ${
        worstTarget.playedNoteLabel ? `as ${worstTarget.playedNoteLabel}` : "unclearly"
      } and averaged ${Math.round(Math.abs(worstTarget.centsFromTarget))} cents ${
        worstTarget.centsFromTarget > 0 ? "sharp" : "flat"
      } against the target scale.`
    );
  } else if (unstableNote && Math.abs(unstableNote.averageCentsOffset) > 10) {
    corrections.push(
      `${unstableNote.noteLabel} averaged ${Math.round(Math.abs(unstableNote.averageCentsOffset))} cents ${
        unstableNote.averageCentsOffset > 0 ? "sharp" : "flat"
      }. Recheck left-hand placement on that note.`
    );
  } else if (pitch.meanCentsOffset !== null && pitch.meanCentsOffset > 7) {
    corrections.push("Your upper finger placements tended sharp, especially on sustained notes.");
  } else if (pitch.meanCentsOffset !== null && pitch.meanCentsOffset < -7) {
    corrections.push("Your left hand settled flat on several notes. Check fingertip placement before shifting.");
  } else {
    corrections.push("Your pitch center was generally aligned, but keep refining intonation consistency between repetitions.");
  }

  if (rhythm.rhythmLabel === "Rushing eighth-note subdivisions") {
    corrections.push("Your off-beat subdivisions arrived early. Keep the inner count steady before each 'and' entry.");
  } else if (rhythm.rhythmLabel === "Late downbeats") {
    corrections.push("Downbeats landed late after preparation. Set the bow earlier so the beat speaks on time.");
  } else if (rhythm.rhythmLabel === "Weak bar-line recovery") {
    corrections.push("You lost precision at bar lines. Re-anchor the pulse on beat 1 before continuing the phrase.");
  } else if (rhythm.rhythmLabel === "Slightly rushing") {
    corrections.push("You accelerated after stronger accents. Keep subdivisions active through each bow change.");
  } else if (rhythm.rhythmLabel === "Dragging slightly") {
    corrections.push("The pulse relaxed after phrase starts. Keep the metrical spine moving through the middle of the line.");
  } else {
    corrections.push("Pulse was fairly steady. Focus on keeping note lengths equally spaced during crossings.");
  }

  if (bow.bowLabel === "Pressure spikes detected") {
    corrections.push("Bow pressure jumped between attacks. Aim for a smoother contact transfer at the string.");
  } else if (bow.bowLabel === "Bow drift under soft notes") {
    corrections.push("Your softer playing lost bow lane consistency. Keep the bow path anchored as dynamics drop.");
  } else {
    corrections.push("Bow motion stayed relatively controlled. Keep matching arm weight to contact point.");
  }

  if (timbre.timbreLabel === "Bright but edgy") {
    corrections.push("Your tone is speaking clearly, but the upper partials are a bit aggressive. Ease pressure slightly before the bow bites.");
  } else if (timbre.timbreLabel === "Dark and covered") {
    corrections.push("The tone is warm but covered. Add a touch more bridge contact so the sound projects with more core.");
  } else if (timbre.timbreLabel === "Tone color unstable") {
    corrections.push("Tone color is changing too much within the phrase. Stabilize the contact point before increasing speed.");
  } else {
    corrections.push("Tone color is fairly balanced. Keep that resonance while refining intonation and rhythm.");
  }

  const focus = [
    worstTarget
      ? `Tune ${worstTarget.expectedNoteLabel} against the scale target before increasing tempo.`
      : unstableNote
      ? `Stabilize ${unstableNote.noteLabel} before speeding up the phrase.`
      : pitch.meanCentsOffset !== null && pitch.meanCentsOffset > 7
        ? "Release the third finger slightly lower to reduce sharpness."
        : "Match each new note to a centered pitch before increasing speed.",
    rhythm.rhythmLabel === "Rushing eighth-note subdivisions"
      ? "Count the off-beat 'and' before placing each short note."
      : rhythm.rhythmLabel === "Weak bar-line recovery"
      ? "Rebuild the pulse at each new measure before moving on."
      : rhythm.rhythmLabel === "Slightly rushing"
      ? "Slow down subdivisions after string crossings."
      : "Keep consistent internal counting through the phrase.",
    timbre.timbreLabel === "Bright but edgy"
      ? "Release pressure at the start of the bow so brilliance stays focused instead of scratchy."
      : timbre.timbreLabel === "Dark and covered"
      ? "Bring the contact point a little closer to the bridge for more ring."
      : "Keep the tone core stable across dynamic changes."
  ];

  const drillTempo = rhythm.detectedTempoBpm ? Math.max(52, Math.round(rhythm.detectedTempoBpm * 0.72)) : 60;
  const recommendedDrill =
    mode === "Scale Practice"
      ? `Play the scale again at ${drillTempo} BPM with a drone and hold each fingered note for two beats.`
      : `Repeat the passage at ${drillTempo} BPM, separating every string crossing and checking the first note after each change.`;

  return { corrections, focus, recommendedDrill };
}

function buildMeasureLabel(measureNumber: number | null, beatInMeasure: number | null, subdivisionLabel: string | null) {
  if (!measureNumber || !beatInMeasure) {
    return "Waiting for score position";
  }

  return `m.${measureNumber} beat ${beatInMeasure}${
    subdivisionLabel && subdivisionLabel !== "downbeat" ? ` · ${subdivisionLabel}` : ""
  }`;
}

export function buildRealtimeScoreFollower(args: {
  expectedNotes: ExpectedTargetNote[];
  detectedNotes: DetectedNote[];
  currentFrame: {
    timestampMs: number;
    pitchHz: number | null;
    centsOffset: number | null;
    noteLabel: string | null;
    confidence: number;
    stability: number;
  } | null;
  sessionElapsedMs: number;
}) {
  const { expectedNotes, detectedNotes, currentFrame, sessionElapsedMs } = args;
  const performedDurationMs = Math.max(
    sessionElapsedMs,
    detectedNotes[detectedNotes.length - 1]?.startMs !== undefined
      ? detectedNotes[detectedNotes.length - 1]!.startMs + detectedNotes[detectedNotes.length - 1]!.durationMs
      : 0
  );
  const aligned = alignDetectedToTarget(detectedNotes, expectedNotes, performedDurationMs);
  const matchedCount = aligned.targetComparisons.filter((comparison) => comparison.playedNoteLabel !== null).length;
  const currentTargetIndex = Math.min(matchedCount, Math.max(aligned.expectedNotes.length - 1, 0));
  const currentExpected = aligned.expectedNotes[currentTargetIndex] ?? null;
  const lastMatched = [...aligned.targetComparisons].reverse().find((comparison) => comparison.playedNoteLabel !== null) ?? null;
  const targetFrequency = currentExpected ? noteLabelToFrequency(currentExpected.noteLabel) : null;
  const centsFromTarget =
    currentFrame?.pitchHz && targetFrequency
      ? Number((1200 * Math.log2(currentFrame.pitchHz / targetFrequency)).toFixed(1))
      : null;
  const timingDeltaMs = currentExpected ? sessionElapsedMs - currentExpected.startMs : null;
  const matched = Boolean(
    currentFrame?.noteLabel &&
      currentExpected?.noteLabel &&
      currentFrame.noteLabel === currentExpected.noteLabel &&
      (centsFromTarget === null || Math.abs(centsFromTarget) <= 18)
  );

  let statusLabel = "Listening for stable pitch";
  if (!currentFrame?.noteLabel || currentFrame.pitchHz === null) {
    statusLabel = currentExpected ? `Waiting for ${currentExpected.noteLabel}` : "Waiting for next note";
  } else if (!currentExpected) {
    statusLabel = `Tracking ${currentFrame.noteLabel}`;
  } else if (!matched) {
    if (currentFrame.noteLabel !== currentExpected.noteLabel) {
      statusLabel = `Expected ${currentExpected.noteLabel}, hearing ${currentFrame.noteLabel}`;
    } else if (centsFromTarget !== null && centsFromTarget > 8) {
      statusLabel = `${Math.round(centsFromTarget)} cents sharp vs ${currentExpected.noteLabel}`;
    } else if (centsFromTarget !== null && centsFromTarget < -8) {
      statusLabel = `${Math.abs(Math.round(centsFromTarget))} cents flat vs ${currentExpected.noteLabel}`;
    } else {
      statusLabel = `Lock ${currentExpected.noteLabel} before moving on`;
    }
  } else {
    statusLabel = `${currentExpected.noteLabel} locked in`;
  }

  const liveTunerFrame: LiveTunerFrame | null = currentFrame
    ? {
        timestampMs: currentFrame.timestampMs,
        pitchHz: currentFrame.pitchHz,
        centsOffset: currentFrame.centsOffset,
        noteLabel: currentFrame.noteLabel,
        confidence: currentFrame.confidence,
        stability: currentFrame.stability,
        targetNoteLabel: currentExpected?.noteLabel ?? null,
        targetMeasureNumber: currentExpected?.measureNumber ?? null,
        targetBeatInMeasure: currentExpected?.beatInMeasure ?? null,
        targetSubdivisionLabel: currentExpected?.subdivisionLabel ?? null,
        timingDeltaMs,
        centsFromTarget,
        matched,
        statusLabel
      }
    : null;

  const liveScoreFollower: LiveScoreFollower | null = aligned.expectedNotes.length
    ? {
        currentExpectedNoteLabel: currentExpected?.noteLabel ?? null,
        matchedNotes: matchedCount,
        totalExpectedNotes: aligned.expectedNotes.length,
        progress: clamp(matchedCount / aligned.expectedNotes.length, 0, 1),
        currentMeasureLabel: buildMeasureLabel(
          currentExpected?.measureNumber ?? null,
          currentExpected?.beatInMeasure ?? null,
          currentExpected?.subdivisionLabel ?? null
        ),
        trackingLabel: liveTunerFrame?.statusLabel ?? (currentExpected ? `Waiting for ${currentExpected.noteLabel}` : "Waiting for score"),
        alignmentConfidence: clamp(
          Math.round((lastMatched?.matched ? 78 : 52) + (currentFrame?.stability ?? 0) * 0.22),
          24,
          99
        ),
        lastMatchedNoteLabel: lastMatched?.playedNoteLabel ?? null,
        lastMatchedMeasureNumber: lastMatched?.measureNumber ?? null
      }
    : null;

  return {
    liveTunerFrame,
    liveScoreFollower,
    targetComparisons: aligned.targetComparisons,
    expectedNotes: aligned.expectedNotes
  };
}

function buildTopIssue(
  pitch: PitchSummary,
  rhythm: RhythmSummary
): FixLoopIssue | null {
  const timingCandidate = [...pitch.targetComparisons]
    .filter((comparison) => comparison.timingDeltaMs !== null)
    .sort((a, b) => Math.abs(b.timingDeltaMs ?? 0) - Math.abs(a.timingDeltaMs ?? 0))[0];
  const pitchCandidate = [...pitch.targetComparisons]
    .filter((comparison) => comparison.centsFromTarget !== null)
    .sort((a, b) => Math.abs(b.centsFromTarget ?? 0) - Math.abs(a.centsFromTarget ?? 0))[0];

  if (
    timingCandidate &&
    (rhythm.rhythmLabel === "Rushing eighth-note subdivisions" ||
      rhythm.rhythmLabel === "Weak bar-line recovery" ||
      Math.abs(timingCandidate.timingDeltaMs ?? 0) > 90)
  ) {
    return {
      code:
        rhythm.rhythmLabel === "Rushing eighth-note subdivisions"
          ? "rhythm_rushing_crossings"
          : `rhythm_${timingCandidate.rhythmicLabel.toLowerCase().replace(/\s+/g, "_")}`,
      title:
        rhythm.rhythmLabel === "Rushing eighth-note subdivisions"
          ? "Top Issue: rushing after string crossings"
          : `Top Issue: ${timingCandidate.rhythmicLabel.toLowerCase()}`,
      description: `Measure ${timingCandidate.measureNumber}, beat ${timingCandidate.beatInMeasure}${
        timingCandidate.subdivisionLabel !== "downbeat" ? ` (${timingCandidate.subdivisionLabel})` : ""
      } is the weak spot.`,
      segmentStartMs: Math.max(0, timingCandidate.expectedStartMs - 220),
      segmentEndMs: Math.max(
        Math.max(0, timingCandidate.expectedStartMs - 220) + 900,
        timingCandidate.expectedStartMs + 880
      ),
      targetTempoBpm: 60,
      requiredCorrectReps: 3,
      cue: "Loop this segment slowly, lock the crossing to the beat, and earn three clean reps."
    };
  }

  if (pitchCandidate && pitchCandidate.centsFromTarget !== null) {
    return {
      code: `pitch_${pitchCandidate.expectedNoteLabel.toLowerCase()}`,
      title: `Top Issue: ${pitchCandidate.expectedNoteLabel} intonation drift`,
      description: `${pitchCandidate.expectedNoteLabel} is ${Math.abs(
        Math.round(pitchCandidate.centsFromTarget)
      )} cents ${pitchCandidate.centsFromTarget > 0 ? "sharp" : "flat"} in the problem passage.`,
      segmentStartMs: Math.max(0, pitchCandidate.expectedStartMs - 220),
      segmentEndMs: Math.max(
        Math.max(0, pitchCandidate.expectedStartMs - 220) + 900,
        pitchCandidate.expectedStartMs + 880
      ),
      targetTempoBpm: 60,
      requiredCorrectReps: 3,
      cue: "Loop this pitch group slowly and center the finger before each rep."
    };
  }

  return null;
}

export function buildSessionAnalysis(args: {
  mode: PracticeMode;
  scaleTargetId: ScaleTargetId | null;
  target: PracticeTarget | null;
  durationMs: number;
  recordingUri: string | null;
  meterSeries: number[];
  waveform: number[];
  pitchFrames: number[][];
  nativePitchSummary?: EnginePitchSummary | null;
}) {
  const { mode, scaleTargetId, target, durationMs, recordingUri, meterSeries, waveform, pitchFrames, nativePitchSummary } = args;
  const fallbackPitch = summarizePitch(pitchFrames, target);
  const pitch = nativePitchSummary
    ? {
        ...fallbackPitch,
        ...nativePitchSummary,
        expectedNotes: nativePitchSummary.expectedNotes ?? fallbackPitch.expectedNotes,
        expectedNoteLabels: nativePitchSummary.expectedNoteLabels ?? fallbackPitch.expectedNoteLabels,
        targetComparisons:
          nativePitchSummary.targetComparisons?.map((comparison, index) => ({
            ...comparison,
            expectedStartMs: comparison.expectedStartMs ?? fallbackPitch.targetComparisons[index]?.expectedStartMs ?? 0,
            playedStartMs: comparison.playedStartMs ?? fallbackPitch.targetComparisons[index]?.playedStartMs ?? null,
            timingDeltaMs: comparison.timingDeltaMs ?? fallbackPitch.targetComparisons[index]?.timingDeltaMs ?? null
          })) ?? fallbackPitch.targetComparisons
      }
    : fallbackPitch;
  const rhythm = summarizeRhythm(meterSeries, 120, pitch.targetComparisons);
  const bow = summarizeBowControl(meterSeries);
  const timbre = summarizeTimbre(pitchFrames);
  const { corrections, focus, recommendedDrill } = buildCorrections(pitch, rhythm, bow, timbre, mode);
  const topIssue = buildTopIssue(pitch, rhythm);
  const averageMetering = mean(meterSeries);
  const peakMetering = meterSeries.length > 0 ? Math.max(...meterSeries) : 0;
  const scaleTargetName = SCALE_TARGETS.find((scale) => scale.id === scaleTargetId)?.name ?? null;

  const weightedScore = Math.round(
    pitch.pitchAccuracy * 0.35 + rhythm.rhythmStability * 0.28 + bow.bowControl * 0.2 + timbre.timbreStability * 0.17
  );

  return {
    id: `${Date.now()}`,
    timestamp: new Date().toISOString(),
    mode,
    scaleTargetId,
    scaleTargetName,
    targetId: target?.id ?? null,
    targetName: target?.name ?? null,
    targetSourceType: target?.sourceType ?? null,
    durationMs,
    recordingUri,
    averageMetering: Number(averageMetering.toFixed(3)),
    peakMetering: Number(peakMetering.toFixed(3)),
    detectedTempoBpm: rhythm.detectedTempoBpm,
    rhythmStability: rhythm.rhythmStability,
    pitchAccuracy: pitch.pitchAccuracy,
    bowControl: bow.bowControl,
    timbreBrightness: timbre.timbreBrightness,
    timbreStability: timbre.timbreStability,
    timbreLabel: timbre.timbreLabel,
    timbreInsights: timbre.timbreInsights,
    overallScore: clamp(weightedScore, 0, 100),
    meanCentsOffset: pitch.meanCentsOffset,
    intonationSpread: pitch.intonationSpread,
    detectedPitchHz: pitch.detectedPitchHz,
    dominantNoteLabel: pitch.dominantNoteLabel,
    pitchLabel: pitch.pitchLabel,
    rhythmLabel: rhythm.rhythmLabel,
    bowLabel: bow.bowLabel,
    corrections,
    recommendedDrill,
    focus,
    waveform,
    pitchTrack: pitch.pitchTrack,
    detectedNotes: pitch.detectedNotes,
    expectedNoteLabels: pitch.expectedNoteLabels,
    expectedNotes: pitch.expectedNotes,
    targetComparisons: pitch.targetComparisons,
    topIssue
  } satisfies SessionAnalysis;
}

function computePracticeStreak(history: SessionAnalysis[]) {
  const uniqueDays = Array.from(
    new Set(history.map((session) => session.timestamp.slice(0, 10)))
  ).sort((a, b) => b.localeCompare(a));

  if (uniqueDays.length === 0) {
    return 0;
  }

  let streak = 0;
  let cursor = new Date(uniqueDays[0]);

  for (const day of uniqueDays) {
    const current = new Date(day);
    if (cursor.toISOString().slice(0, 10) === current.toISOString().slice(0, 10)) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  return streak;
}

export function buildTwinProfile(history: SessionAnalysis[]): TwinProfile {
  const recent = history.slice(0, 6);
  const avgPitch = mean(recent.map((session) => session.pitchAccuracy));
  const avgRhythm = mean(recent.map((session) => session.rhythmStability));
  const avgBow = mean(recent.map((session) => session.bowControl));
  const avgTimbre = mean(recent.map((session) => session.timbreStability ?? 0));
  const strengths: string[] = [];
  const weakPatterns: string[] = [];

  if (avgPitch >= 80) {
    strengths.push("Centered intonation around recent pitch targets");
  }
  if (avgRhythm >= 76) {
    strengths.push("Reliable tempo recovery after rhythmic drift");
  }
  if (avgBow >= 74) {
    strengths.push("Strong tone consistency through changing dynamics");
  }
  if (avgTimbre >= 72) {
    strengths.push("Tone color remains stable across recent sessions");
  }

  if (avgPitch < 78) {
    weakPatterns.push("Pitch center still shifts under pressure");
  }
  if (avgRhythm < 74) {
    weakPatterns.push("Subdivision control weakens after accents");
  }
  if (avgBow < 72) {
    weakPatterns.push("Bow lane and pressure vary on softer passages");
  }
  if (avgTimbre < 66) {
    weakPatterns.push("Tone color shifts too much between notes and dynamics");
  }

  if (strengths.length === 0) {
    strengths.push("Practice data is starting to form a usable baseline");
  }
  if (weakPatterns.length === 0) {
    weakPatterns.push("No major repeat weakness detected yet");
  }

  const frequentNotes = new Map<string, number>();
  history.slice(0, 10).forEach((session) => {
    session.detectedNotes.forEach((note) => {
      if (Math.abs(note.averageCentsOffset) > 10) {
        frequentNotes.set(note.noteLabel, (frequentNotes.get(note.noteLabel) ?? 0) + 1);
      }
    });
  });
  const topPitchRisk = Array.from(frequentNotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topPitchRisk && !weakPatterns.some((item) => item.includes(topPitchRisk))) {
    weakPatterns.unshift(`${topPitchRisk} repeatedly drifts out of tune across recent sessions`);
  }

  const confidence = history.length === 0
    ? 18
    : clamp(Math.round(36 + history.length * 4.5 + recent.length * 1.5), 18, 94);

  return {
    strengths,
    weakPatterns,
    twinConfidence: `${confidence}%`,
    sessionsAnalyzed: history.length,
    practiceStreakDays: computePracticeStreak(history),
    chartValues: recent.map((session) => session.overallScore).reverse()
  };
}

export function buildDashboardMetrics(history: SessionAnalysis[]) {
  const latest = history[0];
  const twin = buildTwinProfile(history);

  return [
    {
      label: "Pitch Accuracy",
      value: latest ? `${latest.pitchAccuracy}%` : "--",
      accent: "cyan" as const
    },
    {
      label: "Rhythm Stability",
      value: latest ? `${latest.rhythmStability}%` : "--",
      accent: "violet" as const
    },
    {
      label: "Bow Control",
      value: latest ? `${latest.bowControl}%` : "--",
      accent: "magenta" as const
    },
    {
      label: "Practice Streak",
      value: `${twin.practiceStreakDays} day${twin.practiceStreakDays === 1 ? "" : "s"}`,
      accent: "cyan" as const
    }
  ];
}
