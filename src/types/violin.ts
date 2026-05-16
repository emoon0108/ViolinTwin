export type PracticeMode = "Scale Practice" | "Etude" | "Solo Piece";
export type ScaleTargetId = "a_major" | "d_major" | "g_major";
export type PracticeTargetSource = "built-in-scale" | "musicxml" | "midi";

export type ExpectedTargetNote = {
  noteLabel: string;
  startMs: number;
  durationMs: number;
  measureNumber: number;
  beatIndex: number;
  beatInMeasure: number;
  subdivisionLabel: string;
  voice?: string | null;
  staff?: string | null;
  channel?: number | null;
  instrument?: number | null;
  dynamic?: string | null;
  keySignature?: string | null;
  timeSignature?: string | null;
  tempoBpm?: number | null;
  articulations?: string[];
  ornaments?: string[];
  tied?: boolean;
  slurred?: boolean;
  chordTone?: boolean;
};

export type PracticeTarget = {
  id: string;
  name: string;
  sourceType: PracticeTargetSource;
  expectedNoteLabels: string[];
  expectedNotes: ExpectedTargetNote[];
};

export type MetricAccent = "cyan" | "violet" | "magenta";

export type DashboardMetric = {
  label: string;
  value: string;
  accent: MetricAccent;
};

export type LiveMetricTone = "warning" | "success" | "cyan";

export type LiveMetric = {
  label: string;
  value: string;
  tone: LiveMetricTone;
};

export type PitchTrackPoint = {
  timeMs: number;
  pitchHz: number | null;
  centsOffset: number | null;
  noteLabel: string | null;
};

export type DetectedNote = {
  noteLabel: string;
  startMs: number;
  durationMs: number;
  averagePitchHz: number;
  averageCentsOffset: number;
  confidence: number;
};

export type TargetComparison = {
  expectedNoteLabel: string;
  playedNoteLabel: string | null;
  centsFromTarget: number | null;
  matched: boolean;
  expectedStartMs: number;
  playedStartMs: number | null;
  timingDeltaMs: number | null;
  measureNumber: number;
  beatInMeasure: number;
  subdivisionLabel: string;
  rhythmicLabel: string;
};

export type LiveTunerFrame = {
  timestampMs: number;
  pitchHz: number | null;
  centsOffset: number | null;
  noteLabel: string | null;
  confidence: number;
  stability: number;
  targetNoteLabel: string | null;
  targetMeasureNumber: number | null;
  targetBeatInMeasure: number | null;
  targetSubdivisionLabel: string | null;
  timingDeltaMs: number | null;
  centsFromTarget: number | null;
  matched: boolean;
  statusLabel: string;
};

export type LiveScoreFollower = {
  currentExpectedNoteLabel: string | null;
  matchedNotes: number;
  totalExpectedNotes: number;
  progress: number;
  currentMeasureLabel: string;
  trackingLabel: string;
  alignmentConfidence: number;
  lastMatchedNoteLabel: string | null;
  lastMatchedMeasureNumber: number | null;
};

export type FixLoopIssue = {
  code: string;
  title: string;
  description: string;
  segmentStartMs: number;
  segmentEndMs: number;
  targetTempoBpm: number;
  requiredCorrectReps: number;
  cue: string;
};

export type PracticeInterruption = {
  issueCode: string;
  repeats: number;
  message: string;
  forcedTempoBpm: number;
};

export type PracticeStatusMessage = {
  tone: "info" | "warning" | "error";
  message: string;
};

export type SessionAnalysis = {
  id: string;
  timestamp: string;
  mode: PracticeMode;
  scaleTargetId: ScaleTargetId | null;
  scaleTargetName: string | null;
  targetId: string | null;
  targetName: string | null;
  targetSourceType: PracticeTargetSource | null;
  durationMs: number;
  recordingUri: string | null;
  averageMetering: number;
  peakMetering: number;
  detectedTempoBpm: number | null;
  rhythmStability: number;
  pitchAccuracy: number;
  bowControl: number;
  timbreBrightness: number;
  timbreStability: number;
  timbreLabel: string;
  timbreInsights: string[];
  overallScore: number;
  meanCentsOffset: number | null;
  intonationSpread: number | null;
  detectedPitchHz: number | null;
  dominantNoteLabel: string | null;
  pitchLabel: string;
  rhythmLabel: string;
  bowLabel: string;
  corrections: string[];
  recommendedDrill: string;
  focus: string[];
  waveform: number[];
  pitchTrack: PitchTrackPoint[];
  detectedNotes: DetectedNote[];
  expectedNoteLabels: string[];
  expectedNotes: ExpectedTargetNote[];
  targetComparisons: TargetComparison[];
  topIssue: FixLoopIssue | null;
};

export type TwinProfile = {
  strengths: string[];
  weakPatterns: string[];
  twinConfidence: string;
  sessionsAnalyzed: number;
  practiceStreakDays: number;
  chartValues: number[];
};

export type PracticeContextValue = {
  permissionGranted: boolean;
  isRecording: boolean;
  isAnalyzing: boolean;
  analysisProgress: number;
  practiceMode: PracticeMode;
  selectedScaleTargetId: ScaleTargetId;
  selectedTargetId: string;
  liveWaveform: number[];
  liveMetrics: LiveMetric[];
  dashboardMetrics: DashboardMetric[];
  todayFocus: string[];
  latestSession: SessionAnalysis | null;
  history: SessionAnalysis[];
  twinProfile: TwinProfile;
  practiceModes: PracticeMode[];
  scaleTargets: { id: ScaleTargetId; name: string; expectedNoteLabels: string[] }[];
  availableTargets: PracticeTarget[];
  sessionDurationMs: number;
  recordingExists: boolean;
  nativeRealtimeAvailable: boolean;
  playbackPositionMs: number;
  playbackDurationMs: number;
  isPlayingBack: boolean;
  liveTunerFrame: LiveTunerFrame | null;
  liveScoreFollower: LiveScoreFollower | null;
  activeFixLoop: FixLoopIssue | null;
  fixLoopReps: number;
  practiceInterruption: PracticeInterruption | null;
  statusMessage: PracticeStatusMessage | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  analyzeCurrentSession: () => Promise<boolean>;
  setPracticeMode: (mode: PracticeMode) => void;
  setSelectedScaleTargetId: (scaleId: ScaleTargetId) => void;
  setSelectedTargetId: (targetId: string) => void;
  importPracticeTarget: () => Promise<void>;
  togglePlayback: () => Promise<void>;
  seekPlayback: (positionMs: number) => Promise<void>;
  startFixLoop: () => Promise<void>;
  stopFixLoop: () => Promise<void>;
  completeFixRep: () => void;
  refreshHistory: () => Promise<void>;
};
