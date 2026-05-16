import { DetectedNote } from "../types/violin";

export const LIVE_FRAME_FLOOR_MS = 90;

export type RealtimeAccumulatedNote = {
  noteLabel: string;
  startMs: number;
  lastTimestampMs: number;
  pitches: number[];
  centsOffsets: number[];
  confidences: number[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function finalizeRealtimeNote(note: RealtimeAccumulatedNote | null, endMs: number): DetectedNote | null {
  if (!note || note.pitches.length < 2) {
    return null;
  }

  const durationMs = Math.max(LIVE_FRAME_FLOOR_MS * 2, endMs - note.startMs + LIVE_FRAME_FLOOR_MS);
  return {
    noteLabel: note.noteLabel,
    startMs: note.startMs,
    durationMs,
    averagePitchHz: Number(mean(note.pitches).toFixed(1)),
    averageCentsOffset: Number(mean(note.centsOffsets).toFixed(1)),
    confidence: clamp(Math.round(mean(note.confidences)), 24, 99)
  };
}
