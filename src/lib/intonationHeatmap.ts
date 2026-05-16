export type PitchLike = number;

export type IntonationSample = {
  pitch_detected: PitchLike;
  target_pitch: PitchLike;
  string_index: 0 | 1 | 2 | 3;
  finger_position: number;
  target_label?: string;
};

export type ViewMode = "session" | "focus";

export type HeatmapCell = {
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  density: number;
  weightedCents: number;
  sampleCount: number;
};

export type HeatmapBuildOptions = {
  columns?: number;
  rows?: number;
  sigmaX?: number;
  sigmaY?: number;
  centsClamp?: number;
};

const DEFAULT_OPTIONS: Required<HeatmapBuildOptions> = {
  columns: 4,
  rows: 140,
  sigmaX: 0.45,
  sigmaY: 0.05,
  centsClamp: 50
};

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function normalizePitchToHz(pitch: PitchLike) {
  return pitch > 127 ? pitch : midiToFrequency(pitch);
}

export function frequencyToCentsDeviation(detectedFrequency: number, targetFrequency: number) {
  if (detectedFrequency <= 0 || targetFrequency <= 0) {
    return 0;
  }

  return 1200 * Math.log2(detectedFrequency / targetFrequency);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function withCentsDeviation(sample: IntonationSample) {
  const detectedHz = normalizePitchToHz(sample.pitch_detected);
  const targetHz = normalizePitchToHz(sample.target_pitch);
  return {
    ...sample,
    detectedHz,
    targetHz,
    centsDeviation: frequencyToCentsDeviation(detectedHz, targetHz)
  };
}

export function filterIntonationSamples(args: {
  samples: IntonationSample[];
  mode: ViewMode;
  focusLabel?: string | null;
  focusPredicate?: (sample: ReturnType<typeof withCentsDeviation>) => boolean;
}) {
  const { samples, mode, focusLabel, focusPredicate } = args;
  const enriched = samples.map(withCentsDeviation);
  if (mode === "session") {
    return enriched;
  }

  return enriched.filter((sample) => {
    if (focusPredicate) {
      return focusPredicate(sample);
    }

    return focusLabel ? sample.target_label === focusLabel : true;
  });
}

function gaussian(distance: number, sigma: number) {
  return Math.exp(-0.5 * (distance / sigma) ** 2);
}

export function buildIntonationHeatmap(samples: IntonationSample[], options: HeatmapBuildOptions = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const enriched = samples.map(withCentsDeviation);
  const cells: HeatmapCell[] = [];

  for (let column = 0; column < config.columns; column += 1) {
    for (let row = 0; row < config.rows; row += 1) {
      const centerX = column + 0.5;
      const centerY = row / Math.max(1, config.rows - 1);
      let density = 0;
      let weightedCents = 0;
      let sampleCount = 0;

      for (const sample of enriched) {
        const normalizedFinger = clamp(sample.finger_position, 0, 1);
        const dx = centerX - (sample.string_index + 0.5);
        const dy = centerY - normalizedFinger;
        const weight = gaussian(dx, config.sigmaX) * gaussian(dy, config.sigmaY);
        if (weight < 0.0001) {
          continue;
        }

        density += weight;
        weightedCents += clamp(sample.centsDeviation, -config.centsClamp, config.centsClamp) * weight;
        sampleCount += 1;
      }

      cells.push({
        row,
        column,
        x: column / config.columns,
        y: row / config.rows,
        width: 1 / config.columns,
        height: 1 / config.rows,
        density,
        weightedCents: density > 0 ? weightedCents / density : 0,
        sampleCount
      });
    }
  }

  const maxDensity = Math.max(...cells.map((cell) => cell.density), 0.0001);
  return cells.map((cell) => ({
    ...cell,
    density: cell.density / maxDensity
  }));
}

export function summarizeHotspot(cell: HeatmapCell) {
  return {
    averageCentsDeviation: Number(cell.weightedCents.toFixed(1)),
    density: Number(cell.density.toFixed(3)),
    sampleCount: cell.sampleCount,
    stringIndex: cell.column,
    fingerPosition: Number((cell.y + cell.height / 2).toFixed(3))
  };
}


const VIOLIN_OPEN_STRING_MIDI = [55, 62, 69, 76] as const;

export function noteLabelToMidi(noteLabel: string) {
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
  return midi;
}

export function inferViolinStringAndFingerPosition(noteLabel: string) {
  const midi = noteLabelToMidi(noteLabel);
  if (midi === null) {
    return null;
  }

  let chosenStringIndex: 0 | 1 | 2 | 3 = 3;
  for (let index = VIOLIN_OPEN_STRING_MIDI.length - 1; index >= 0; index -= 1) {
    if (midi >= VIOLIN_OPEN_STRING_MIDI[index]!) {
      chosenStringIndex = index as 0 | 1 | 2 | 3;
      break;
    }
  }

  const openMidi = VIOLIN_OPEN_STRING_MIDI[chosenStringIndex];
  const semitoneDistance = Math.max(0, midi - openMidi);
  const fingerPosition = clamp(semitoneDistance / 24, 0, 1);

  return {
    midi,
    string_index: chosenStringIndex,
    finger_position: Number(fingerPosition.toFixed(3))
  };
}

export function buildHeatmapSamplesFromSession(session: {
  targetName: string | null;
  targetComparisons: {
    expectedNoteLabel: string;
    playedNoteLabel: string | null;
  }[];
}): IntonationSample[] {
  const focusLabel = session.targetName ?? "Session Focus";
  const samples: IntonationSample[] = [];

  session.targetComparisons.forEach((comparison) => {
    if (!comparison.playedNoteLabel) {
      return;
    }

    const playedPlacement = inferViolinStringAndFingerPosition(comparison.playedNoteLabel);
    const targetMidi = noteLabelToMidi(comparison.expectedNoteLabel);
    const playedMidi = noteLabelToMidi(comparison.playedNoteLabel);
    if (!playedPlacement || targetMidi === null || playedMidi === null) {
      return;
    }

    samples.push({
      pitch_detected: playedMidi,
      target_pitch: targetMidi,
      string_index: playedPlacement.string_index,
      finger_position: playedPlacement.finger_position,
      target_label: focusLabel
    });
  });

  return samples;
}
