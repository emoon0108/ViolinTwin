import { SessionAnalysis } from "../types/violin";

export type RibbonPoint = {
  index: number;
  measureNumber: number;
  subdivisionLabel: string;
  centsDeviation: number;
  timingDeltaMs: number;
  matched: boolean;
  label: string;
};

export type TwinDiagnostic = {
  title: string;
  body: string;
  tone: "cyan" | "violet" | "warning";
};

export type BowEvidence = {
  title: string;
  value: string;
  explanation: string;
};

export type GrowthSnapshot = {
  currentConsistencyScore: number;
  previousConsistencyScore: number | null;
  delta: number | null;
  currentSpreadCents: number;
  previousSpreadCents: number | null;
  message: string;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildIntonationRibbon(session: SessionAnalysis): RibbonPoint[] {
  return session.targetComparisons.map((comparison, index) => ({
    index,
    measureNumber: comparison.measureNumber,
    subdivisionLabel: comparison.subdivisionLabel,
    centsDeviation: comparison.centsFromTarget ?? 0,
    timingDeltaMs: comparison.timingDeltaMs ?? 0,
    matched: comparison.matched,
    label: comparison.expectedNoteLabel
  }));
}

export function buildTwinDiagnostics(args: { latestSession: SessionAnalysis; history: SessionAnalysis[] }): TwinDiagnostic[] {
  const { latestSession, history } = args;
  const matchedComparisons = latestSession.targetComparisons.filter(
    (comparison) => comparison.centsFromTarget !== null
  );
  const flattest = [...matchedComparisons].sort(
    (a, b) => (a.centsFromTarget ?? 0) - (b.centsFromTarget ?? 0)
  )[0];
  const shiftRisk = [...latestSession.targetComparisons]
    .filter((comparison) => comparison.timingDeltaMs !== null)
    .sort((a, b) => Math.abs(b.timingDeltaMs ?? 0) - Math.abs(a.timingDeltaMs ?? 0))[0];

  const midpoint = Math.max(1, Math.floor(latestSession.detectedNotes.length / 2));
  const firstHalf = latestSession.detectedNotes.slice(0, midpoint).map((note) => Math.abs(note.averageCentsOffset));
  const secondHalf = latestSession.detectedNotes.slice(midpoint).map((note) => Math.abs(note.averageCentsOffset));
  const firstHalfAccuracy = firstHalf.length ? clamp(Math.round(100 - mean(firstHalf) * 1.4), 0, 100) : latestSession.pitchAccuracy;
  const secondHalfAccuracy = secondHalf.length ? clamp(Math.round(100 - mean(secondHalf) * 1.4), 0, 100) : latestSession.pitchAccuracy;

  const priorMatch = history.slice(1).find((session) => session.targetId && session.targetId === latestSession.targetId);
  const priorOffset = priorMatch?.meanCentsOffset ?? null;

  return [
    {
      title: "The Finger Frame",
      body: flattest && flattest.centsFromTarget !== null
        ? `${flattest.expectedNoteLabel} is averaging ${Math.abs(Math.round(flattest.centsFromTarget))} cents ${
            flattest.centsFromTarget < 0 ? "flat" : "sharp"
          }. That points to a hand frame that is settling ${flattest.centsFromTarget < 0 ? "too far back toward the scroll" : "too far forward toward the bridge"}.`
        : "Pitch centers are staying near the target lane, so the finger frame is stabilizing.",
      tone: "cyan"
    },
    {
      title: "The Shift Score",
      body: shiftRisk && shiftRisk.timingDeltaMs !== null
        ? `Your biggest landing miss is around measure ${shiftRisk.measureNumber}, beat ${shiftRisk.beatInMeasure}. The arrival was ${Math.abs(Math.round(shiftRisk.timingDeltaMs))} ms ${
            shiftRisk.timingDeltaMs > 0 ? "late" : "early"
          }, which is where pitch confidence is most likely breaking during the shift.`
        : "Shift landings look reasonably aligned against the target timing in this session.",
      tone: "violet"
    },
    {
      title: "Fatigue Alert",
      body: secondHalfAccuracy + 8 < firstHalfAccuracy
        ? `Intonation held around ${firstHalfAccuracy}% in the first half of the take, then fell to ${secondHalfAccuracy}% by the end. That drop suggests fatigue or setup tension building as the piece continued.`
        : priorOffset !== null && latestSession.meanCentsOffset !== null
        ? `Compared with the previous take, your average pitch drift moved from ${priorOffset > 0 ? "+" : ""}${Math.round(priorOffset)} cents to ${latestSession.meanCentsOffset > 0 ? "+" : ""}${Math.round(latestSession.meanCentsOffset)} cents, so endurance is holding steadier today.`
        : "Pitch accuracy stayed relatively even across the session, so fatigue did not dominate this take.",
      tone: "warning"
    }
  ];
}

export function buildBowEvidence(session: SessionAnalysis): BowEvidence[] {
  const pressureValue = `${session.bowControl}% stability`;
  const pressureExplanation =
    session.bowLabel === "Pressure spikes detected"
      ? "Pressure spikes line up with the same places where the intonation ribbon jumps. Smooth the contact before the attack so the left hand is not chasing the pitch."
      : session.bowLabel === "Bow drift under soft notes"
      ? "Bow lane drift is likely softening the core of the sound, which makes the pitch center less stable under lighter dynamics."
      : "Bow support stayed fairly even, so the left hand is carrying most of the remaining pitch error rather than the contact point.";

  const timbreValue = `${session.timbreLabel}`;
  const timbreExplanation =
    session.timbreInsights[0] ??
    "Tone color stayed stable enough that it should be treated as supporting evidence rather than the main problem.";

  const syncValue = session.detectedTempoBpm ? `${session.detectedTempoBpm} BPM context` : "Session context";
  const syncExplanation =
    session.rhythmLabel === "Rushing eighth-note subdivisions"
      ? "The bow hand accelerates through off-beat crossings, and the pitch ribbon tends to flare at the same time."
      : session.rhythmLabel === "Weak bar-line recovery"
      ? "The bow reset around bar lines is the likely trigger for the panic moments shown in the ribbon."
      : "Use the bow metrics here as secondary evidence for the pitch footprint rather than the headline diagnosis.";

  return [
    {
      title: "Bow Pressure",
      value: pressureValue,
      explanation: pressureExplanation
    },
    {
      title: "Tone Core",
      value: timbreValue,
      explanation: timbreExplanation
    },
    {
      title: "Causal Sync",
      value: syncValue,
      explanation: syncExplanation
    }
  ];
}

function consistencyScoreFromSession(session: SessionAnalysis) {
  const cents = session.targetComparisons
    .map((comparison) => comparison.centsFromTarget)
    .filter((value): value is number => value !== null);
  const spread = standardDeviation(cents);
  return {
    spread,
    score: clamp(Math.round(100 - spread * 1.8), 24, 99)
  };
}

export function buildGrowthSnapshot(args: { latestSession: SessionAnalysis; history: SessionAnalysis[] }): GrowthSnapshot {
  const { latestSession, history } = args;
  const current = consistencyScoreFromSession(latestSession);
  const previousSession = history.slice(1).find((session) => session.targetId === latestSession.targetId) ?? null;
  const previous = previousSession ? consistencyScoreFromSession(previousSession) : null;

  return {
    currentConsistencyScore: current.score,
    previousConsistencyScore: previous?.score ?? null,
    delta: previous ? current.score - previous.score : null,
    currentSpreadCents: Number(current.spread.toFixed(1)),
    previousSpreadCents: previous ? Number(previous.spread.toFixed(1)) : null,
    message: previous
      ? current.spread < previous.spread
        ? `The blur is shrinking. Your note landings are ${Math.abs(Math.round(current.spread - previous.spread))} cents tighter than the previous saved take.`
        : `The note cloud is a little wider today. Keep using the focus loop so the landing pattern tightens again.`
      : "Save another session on the same target to unlock a real before-and-after consistency overlay."
  };
}
