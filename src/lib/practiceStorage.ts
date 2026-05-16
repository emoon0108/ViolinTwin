import AsyncStorage from "@react-native-async-storage/async-storage";
import { PracticeTarget, SessionAnalysis } from "../types/violin";

const STORAGE_KEY = "violintwin.sessions.v1";
const TARGET_STORAGE_KEY = "violintwin.targets.v1";

function fallbackExpectedNotes(noteLabels: string[]) {
  return noteLabels.map((noteLabel, index) => ({
    noteLabel,
    startMs: index * 700,
    durationMs: 700,
    measureNumber: Math.floor(index / 4) + 1,
    beatIndex: index,
    beatInMeasure: (index % 4) + 1,
    subdivisionLabel: "downbeat"
  }));
}

function normalizeHistorySession(session: Partial<SessionAnalysis>) {
  const expectedNoteLabels = session.expectedNoteLabels ?? [];

  return {
    ...session,
    scaleTargetId: session.scaleTargetId ?? null,
    scaleTargetName: session.scaleTargetName ?? null,
    targetId: session.targetId ?? null,
    targetName: session.targetName ?? null,
    targetSourceType: session.targetSourceType ?? null,
    topIssue: session.topIssue ?? null,
    dominantNoteLabel: session.dominantNoteLabel ?? null,
    pitchTrack: session.pitchTrack ?? [],
    detectedNotes: session.detectedNotes ?? [],
    waveform: session.waveform ?? [],
    expectedNoteLabels,
    expectedNotes: session.expectedNotes ?? fallbackExpectedNotes(expectedNoteLabels),
    targetComparisons:
      session.targetComparisons?.map((comparison, index) => ({
        ...comparison,
        measureNumber: comparison.measureNumber ?? Math.floor(index / 4) + 1,
        beatInMeasure: comparison.beatInMeasure ?? (index % 4) + 1,
        rhythmicLabel: comparison.rhythmicLabel ?? "Timing not classified"
      })) ?? []
  } as SessionAnalysis;
}

export async function readHistory() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [] as SessionAnalysis[];
  }

  const parsed = JSON.parse(raw) as Partial<SessionAnalysis>[];
  return parsed.map(normalizeHistorySession).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function saveHistory(sessions: SessionAnalysis[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export async function readTargets() {
  const raw = await AsyncStorage.getItem(TARGET_STORAGE_KEY);
  if (!raw) {
    return [] as PracticeTarget[];
  }

  const parsed = JSON.parse(raw) as Partial<PracticeTarget>[];
  return parsed.map((target) => {
    const expectedNoteLabels = target.expectedNoteLabels ?? [];

    return {
      id: target.id ?? `imported-${Date.now()}`,
      name: target.name ?? "Imported Target",
      sourceType: target.sourceType ?? "musicxml",
      expectedNoteLabels,
      expectedNotes: target.expectedNotes ?? fallbackExpectedNotes(expectedNoteLabels)
    };
  });
}

export async function saveTargets(targets: PracticeTarget[]) {
  await AsyncStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(targets));
}
