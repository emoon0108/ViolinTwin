import { EventSubscription, requireNativeModule } from "expo-modules-core";
import { EnginePitchSummary } from "../lib/audioAnalysis";
import { ExpectedTargetNote } from "../types/violin";

type NativeRealtimeFrame = {
  timestampMs: number;
  pitchHz: number | null;
  centsOffset: number | null;
  noteLabel: string | null;
  confidence: number;
  stability: number;
};

type ViolinTwinNativeEngineModule = {
  addListener?: (eventName: string, listener: (event: NativeRealtimeFrame) => void) => EventSubscription;
  removeListeners?: (count: number) => void;
  getCapabilities(): Promise<{
    isNative: boolean;
    supportsOfflinePitch: boolean;
    supportsRealtimeChunk: boolean;
    engineVersion: string;
  }>;
  analyzePitchFrames(frames: number[][], expectedNoteLabels: string[]): Promise<EnginePitchSummary>;
  analyzeRealtimeChunk(samples: number[], sampleRate: number): Promise<{
    pitchHz: number | null;
    centsOffset: number | null;
    noteLabel: string | null;
  }>;
  startRealtimeTracking(expectedNotes: ExpectedTargetNote[]): Promise<boolean>;
  stopRealtimeTracking(): Promise<void>;
};

let nativeModule: ViolinTwinNativeEngineModule | null = null;

try {
  nativeModule = requireNativeModule<ViolinTwinNativeEngineModule>("ViolinTwinEngine");
} catch {
  nativeModule = null;
}

export function isNativeEngineAvailable() {
  return nativeModule !== null;
}

export async function getNativeEngineCapabilities() {
  if (!nativeModule) {
    return {
      isNative: false,
      supportsOfflinePitch: false,
      supportsRealtimeChunk: false,
      engineVersion: "js-fallback"
    };
  }

  return await nativeModule.getCapabilities();
}

export async function analyzePitchFramesWithNative(args: {
  frames: number[][];
  expectedNoteLabels: string[];
}) {
  if (!nativeModule) {
    return null;
  }

  return await nativeModule.analyzePitchFrames(args.frames, args.expectedNoteLabels);
}

export async function analyzeRealtimeChunkWithNative(samples: number[], sampleRate: number) {
  if (!nativeModule) {
    return null;
  }

  return await nativeModule.analyzeRealtimeChunk(samples, sampleRate);
}

export async function startRealtimeTrackingWithNative(expectedNotes: ExpectedTargetNote[]) {
  if (!nativeModule) {
    return false;
  }

  return await nativeModule.startRealtimeTracking(expectedNotes);
}

export async function stopRealtimeTrackingWithNative() {
  if (!nativeModule) {
    return;
  }

  await nativeModule.stopRealtimeTracking();
}

export function subscribeToRealtimeFrames(listener: (frame: NativeRealtimeFrame) => void) {
  if (!nativeModule?.addListener) {
    return null;
  }

  return nativeModule.addListener("onRealtimeFrame", listener);
}

export type { NativeRealtimeFrame };
