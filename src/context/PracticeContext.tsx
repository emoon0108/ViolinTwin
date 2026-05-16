import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioPlayer,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from "expo-audio";
import {
  buildDashboardMetrics,
  buildRealtimeScoreFollower,
  buildSessionAnalysis,
  buildTwinProfile,
  meterToNormalized
} from "../lib/audioAnalysis";
import {
  getNativeEngineCapabilities,
  analyzePitchFramesWithNative,
  startRealtimeTrackingWithNative,
  stopRealtimeTrackingWithNative,
  subscribeToRealtimeFrames,
  type NativeRealtimeFrame
} from "../native/ViolinTwinEngine";
import { parseMidiToTarget, parseMusicXmlToTarget, SCALE_TARGETS } from "../lib/practiceTargets";
import { finalizeRealtimeNote, RealtimeAccumulatedNote } from "../lib/realtimeNotes";
import { readHistory, readTargets, saveHistory, saveTargets } from "../lib/practiceStorage";
import {
  DetectedNote,
  PracticeContextValue,
  PracticeMode,
  PracticeTarget,
  ScaleTargetId,
  SessionAnalysis
} from "../types/violin";

const METER_INTERVAL_MS = 120;
const MAX_WAVEFORM_BARS = 32;

const recorderOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true
};

const PRACTICE_MODES: PracticeMode[] = ["Scale Practice", "Etude", "Solo Piece"];

const PracticeContext = createContext<PracticeContextValue | null>(null);

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compactWaveform(values: number[]) {
  if (values.length <= MAX_WAVEFORM_BARS) {
    return values;
  }

  const bucketSize = Math.ceil(values.length / MAX_WAVEFORM_BARS);
  const buckets: number[] = [];

  for (let index = 0; index < values.length; index += bucketSize) {
    const slice = values.slice(index, index + bucketSize);
    buckets.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  }

  return buckets.slice(-MAX_WAVEFORM_BARS);
}

function buildPracticeInterruption(history: SessionAnalysis[]) {
  const latest = history[0];
  const issueCode = latest?.topIssue?.code;
  if (!issueCode) {
    return null;
  }

  const repeats = history.slice(0, 4).filter((session) => session.topIssue?.code === issueCode).length;
  if (repeats < 4) {
    return null;
  }

  return {
    issueCode,
    repeats,
    message: "You repeated the same timing error 4 times. Slow down.",
    forcedTempoBpm: 50
  };
}

export function PracticeProvider({ children }: PropsWithChildren) {
  const recorder = useAudioRecorder(recorderOptions);
  const recorderState = useAudioRecorderState(recorder, METER_INTERVAL_MS);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("Scale Practice");
  const [selectedScaleTargetId, setSelectedScaleTargetId] = useState<ScaleTargetId>("a_major");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("a_major");
  const [history, setHistory] = useState<SessionAnalysis[]>([]);
  const [importedTargets, setImportedTargets] = useState<PracticeTarget[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [liveWaveform, setLiveWaveform] = useState<number[]>(Array.from({ length: MAX_WAVEFORM_BARS }, () => 0.08));
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [nativeRealtimeAvailable, setNativeRealtimeAvailable] = useState(false);
  const [liveTunerFrame, setLiveTunerFrame] = useState<PracticeContextValue["liveTunerFrame"]>(null);
  const [liveScoreFollower, setLiveScoreFollower] = useState<PracticeContextValue["liveScoreFollower"]>(null);
  const [activeFixLoop, setActiveFixLoop] = useState<SessionAnalysis["topIssue"]>(null);
  const [fixLoopReps, setFixLoopReps] = useState(0);
  const [statusMessage, setStatusMessage] = useState<PracticeContextValue["statusMessage"]>(null);
  const meterSeriesRef = useRef<number[]>([]);
  const waveformRef = useRef<number[]>([]);
  const playbackPlayerRef = useRef<AudioPlayer | null>(null);
  const playbackSourceUriRef = useRef<string | null>(null);
  const activeFixLoopRef = useRef<SessionAnalysis["topIssue"]>(null);
  const realtimeSubscriptionRef = useRef<ReturnType<typeof subscribeToRealtimeFrames> | null>(null);
  const realtimeCurrentNoteRef = useRef<RealtimeAccumulatedNote | null>(null);
  const liveDetectedNotesRef = useRef<DetectedNote[]>([]);
  const latestRealtimeFrameRef = useRef<NativeRealtimeFrame | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const sessions = await readHistory();
        setHistory(sessions);
        const targets = await readTargets();
        setImportedTargets(targets);
      } catch {
        setStatusMessage({
          tone: "warning",
          message: "Saved practice data could not be loaded. New sessions will still work."
        });
      }

      try {
        const capabilities = await getNativeEngineCapabilities();
        setNativeRealtimeAvailable(Boolean(capabilities.supportsRealtimeChunk));
      } catch {
        setNativeRealtimeAvailable(false);
      }
    })();
  }, []);

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false
    }).catch(() => {
      setStatusMessage({
        tone: "error",
        message: "Audio mode could not be prepared. Try restarting the app before recording."
      });
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const permission = await requestRecordingPermissionsAsync();
      setPermissionGranted(permission.granted);
      if (!permission.granted) {
        setStatusMessage({
          tone: "warning",
          message: "Microphone permission is off. Enable it to capture practice audio."
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!recorderState.isRecording) {
      return;
    }

    const normalized = meterToNormalized(recorderState.metering);
    meterSeriesRef.current.push(normalized);
    waveformRef.current.push(normalized);
    setLiveWaveform(compactWaveform(waveformRef.current));
  }, [recorderState.isRecording, recorderState.metering]);

  const latestSession = history[0] ?? null;
  const availableTargets = useMemo(() => [...SCALE_TARGETS, ...importedTargets], [importedTargets]);
  const selectedTarget = useMemo(
    () => availableTargets.find((target) => target.id === selectedTargetId) ?? availableTargets[0] ?? null,
    [availableTargets, selectedTargetId]
  );
  const twinProfile = useMemo(() => buildTwinProfile(history), [history]);
  const dashboardMetrics = useMemo(() => buildDashboardMetrics(history), [history]);
  const practiceInterruption = useMemo(() => buildPracticeInterruption(history), [history]);
  const todayFocus = latestSession?.focus ?? [
    "Capture a session to start building your practice twin.",
    "The current MVP learns from microphone recordings and session history."
  ];

  function recomputeRealtimeFeedback(sessionElapsedMs: number, currentFrame: NativeRealtimeFrame | null) {
    const realtime = buildRealtimeScoreFollower({
      expectedNotes: selectedTarget?.expectedNotes ?? [],
      detectedNotes: liveDetectedNotesRef.current,
      currentFrame: currentFrame
        ? {
            timestampMs: currentFrame.timestampMs,
            pitchHz: currentFrame.pitchHz,
            centsOffset: currentFrame.centsOffset,
            noteLabel: currentFrame.noteLabel,
            confidence: currentFrame.confidence,
            stability: currentFrame.stability
          }
        : null,
      sessionElapsedMs
    });

    setLiveTunerFrame(realtime.liveTunerFrame);
    setLiveScoreFollower(realtime.liveScoreFollower);
  }

  function flushRealtimeNote(endMs: number) {
    const finalized = finalizeRealtimeNote(realtimeCurrentNoteRef.current, endMs);
    realtimeCurrentNoteRef.current = null;
    if (!finalized) {
      return;
    }

    liveDetectedNotesRef.current = [...liveDetectedNotesRef.current, finalized].slice(-64);
  }

  function handleRealtimeFrame(frame: NativeRealtimeFrame) {
    latestRealtimeFrameRef.current = frame;
    const current = realtimeCurrentNoteRef.current;

    if (!frame.noteLabel || frame.pitchHz === null || frame.centsOffset === null) {
      flushRealtimeNote(frame.timestampMs);
      recomputeRealtimeFeedback(frame.timestampMs, frame);
      return;
    }

    if (!current) {
      realtimeCurrentNoteRef.current = {
        noteLabel: frame.noteLabel,
        startMs: frame.timestampMs,
        lastTimestampMs: frame.timestampMs,
        pitches: [frame.pitchHz],
        centsOffsets: [frame.centsOffset],
        confidences: [frame.confidence]
      };
      recomputeRealtimeFeedback(frame.timestampMs, frame);
      return;
    }

    if (current.noteLabel !== frame.noteLabel) {
      flushRealtimeNote(frame.timestampMs);
      realtimeCurrentNoteRef.current = {
        noteLabel: frame.noteLabel,
        startMs: frame.timestampMs,
        lastTimestampMs: frame.timestampMs,
        pitches: [frame.pitchHz],
        centsOffsets: [frame.centsOffset],
        confidences: [frame.confidence]
      };
      recomputeRealtimeFeedback(frame.timestampMs, frame);
      return;
    }

    current.lastTimestampMs = frame.timestampMs;
    current.pitches.push(frame.pitchHz);
    current.centsOffsets.push(frame.centsOffset);
    current.confidences.push(frame.confidence);
    recomputeRealtimeFeedback(frame.timestampMs, frame);
  }

  const liveMetrics = useMemo(() => {
    const currentMeter = meterSeriesRef.current[meterSeriesRef.current.length - 1] ?? 0;
    const pitchValue = liveTunerFrame?.statusLabel ?? latestSession?.pitchLabel ?? "Listening for live pitch";
    const rhythmValue =
      liveScoreFollower?.trackingLabel ?? latestSession?.rhythmLabel ?? "Waiting for target timing";
    const bowValue = currentMeter > 0.55 ? "Stable energy" : currentMeter > 0.28 ? "Supported contact" : "Light contact";
    const tempoValue = latestSession?.detectedTempoBpm ? `${latestSession.detectedTempoBpm} BPM` : "-- BPM";

    return [
      {
        label: "Pitch",
        value: pitchValue,
        tone: liveTunerFrame?.matched || (latestSession?.pitchAccuracy ?? 0) >= 80 ? "success" : "warning"
      },
      {
        label: "Rhythm",
        value: rhythmValue,
        tone: liveScoreFollower?.progress ? "success" : (latestSession?.rhythmStability ?? 0) >= 76 ? "success" : "warning"
      },
      { label: "Bow Angle", value: bowValue, tone: currentMeter > 0.45 ? "success" : "cyan" },
      { label: "Tempo", value: tempoValue, tone: latestSession?.detectedTempoBpm ? "cyan" : "warning" }
    ] as PracticeContextValue["liveMetrics"];
  }, [latestSession, liveScoreFollower, liveTunerFrame]);

  useEffect(() => {
    activeFixLoopRef.current = activeFixLoop;
  }, [activeFixLoop]);

  useEffect(() => {
    if (!latestSession?.recordingUri) {
      setPlaybackPositionMs(0);
      setPlaybackDurationMs(0);
      setIsPlayingBack(false);
      return;
    }

    if (!playbackPlayerRef.current || playbackSourceUriRef.current !== latestSession.recordingUri) {
      playbackPlayerRef.current = createAudioPlayer({ uri: latestSession.recordingUri }, { updateInterval: 100 });
      playbackSourceUriRef.current = latestSession.recordingUri;
      playbackPlayerRef.current.volume = 1;
      playbackPlayerRef.current.addListener("playbackStatusUpdate", () => {
        const player = playbackPlayerRef.current;
        if (!player) {
          return;
        }

        setPlaybackPositionMs(Math.round(player.currentTime * 1000));
        setPlaybackDurationMs(Math.round(player.duration * 1000));
        setIsPlayingBack(player.playing);

        const issue = activeFixLoopRef.current;
        if (issue && player.playing && player.currentTime * 1000 >= issue.segmentEndMs) {
          void player.seekTo(issue.segmentStartMs / 1000).then(() => {
            player.play();
          });
        }
      });
    }
  }, [latestSession?.id, latestSession?.recordingUri]);

  async function refreshHistory() {
    try {
      const sessions = await readHistory();
      setHistory(sessions);
    } catch {
      setStatusMessage({
        tone: "warning",
        message: "Practice history could not be refreshed from device storage."
      });
    }
  }

  async function beginRealtimeTracking() {
    realtimeSubscriptionRef.current?.remove();
    realtimeSubscriptionRef.current = subscribeToRealtimeFrames(handleRealtimeFrame);
    const trackingStarted = await startRealtimeTrackingWithNative(selectedTarget?.expectedNotes ?? []);
    setNativeRealtimeAvailable(trackingStarted || nativeRealtimeAvailable);
  }

  async function endRealtimeTracking() {
    realtimeSubscriptionRef.current?.remove();
    realtimeSubscriptionRef.current = null;
    await stopRealtimeTrackingWithNative();
  }

  async function startRecording() {
    if (!permissionGranted) {
      const permission = await requestRecordingPermissionsAsync();
      setPermissionGranted(permission.granted);
      if (!permission.granted) {
        setStatusMessage({
          tone: "error",
          message: "Microphone permission is required before ViolinTwin can record a session."
        });
        return;
      }
    }

    try {
      setStatusMessage(null);
      meterSeriesRef.current = [];
      waveformRef.current = Array.from({ length: MAX_WAVEFORM_BARS }, () => 0.08);
      liveDetectedNotesRef.current = [];
      realtimeCurrentNoteRef.current = null;
      latestRealtimeFrameRef.current = null;
      setLiveWaveform(waveformRef.current);
      setLiveTunerFrame(null);
      setLiveScoreFollower(null);
      await recorder.prepareToRecordAsync();
      await beginRealtimeTracking();
      recorder.record();
    } catch {
      await endRealtimeTracking();
      setStatusMessage({
        tone: "error",
        message: "Recording could not start. Check microphone access and try again."
      });
    }
  }

  async function stopRecording() {
    if (!recorderState.isRecording) {
      return;
    }

    await recorder.stop();
    flushRealtimeNote(recorderState.durationMillis || latestRealtimeFrameRef.current?.timestampMs || 0);
    recomputeRealtimeFeedback(
      recorderState.durationMillis || latestRealtimeFrameRef.current?.timestampMs || 0,
      latestRealtimeFrameRef.current
    );
    await endRealtimeTracking();
  }

  async function analyzeCurrentSession() {
    if (recorderState.isRecording) {
      await stopRecording();
    }

    if (!recorder.uri) {
      setStatusMessage({
        tone: "warning",
        message: "Record a session before running analysis."
      });
      return false;
    }

    setStatusMessage(null);
    setIsAnalyzing(true);
    setAnalysisProgress(0.08);

    try {
      const sampleFrames: number[][] = [];
      const player = createAudioPlayer({ uri: recorder.uri }, { updateInterval: 120 });
      player.volume = 0;

      const sampleSubscription = player.addListener("audioSampleUpdate", (sample) => {
        const channel = sample.channels[0];
        if (channel?.frames.length) {
          sampleFrames.push(channel.frames.slice(0, 2048));
        }

        if (player.duration > 0) {
          setAnalysisProgress(Math.min(0.95, player.currentTime / player.duration));
        }
      });

      const playbackPromise = new Promise<void>((resolve) => {
        const statusSubscription = player.addListener("playbackStatusUpdate", () => {
          if (player.duration > 0 && player.currentTime >= Math.max(player.duration - 0.05, 0) && !player.playing) {
            statusSubscription.remove();
            resolve();
          }
        });
      });

      player.play();
      await playbackPromise;
      sampleSubscription.remove();
      player.pause();
      player.seekTo(0);

      const expectedNoteLabels = selectedTarget?.expectedNoteLabels ?? [];
      const nativePitchSummary = await analyzePitchFramesWithNative({
        frames: sampleFrames,
        expectedNoteLabels
      });

      const analysis = buildSessionAnalysis({
        mode: practiceMode,
        scaleTargetId: selectedTarget?.sourceType === "built-in-scale" ? selectedScaleTargetId : null,
        target: selectedTarget,
        durationMs: recorderState.durationMillis,
        recordingUri: recorder.uri,
        meterSeries: meterSeriesRef.current,
        waveform: compactWaveform(waveformRef.current),
        pitchFrames: sampleFrames,
        nativePitchSummary
      });

      const nextHistory = [analysis, ...history].slice(0, 24);
      await saveHistory(nextHistory);
      setHistory(nextHistory);
      setAnalysisProgress(1);
      return true;
    } catch {
      setStatusMessage({
        tone: "error",
        message: "Analysis could not finish for this take. Try recording a fresh session."
      });
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function togglePlayback() {
    const player = playbackPlayerRef.current;
    if (!player) {
      return;
    }

    if (player.playing) {
      player.pause();
      setIsPlayingBack(false);
      return;
    }

    if (player.duration > 0 && player.currentTime >= Math.max(player.duration - 0.05, 0)) {
      await player.seekTo(0);
    }

    player.play();
    setIsPlayingBack(true);
  }

  async function seekPlayback(positionMs: number) {
    const player = playbackPlayerRef.current;
    if (!player) {
      return;
    }

    await player.seekTo(positionMs / 1000);
    setPlaybackPositionMs(positionMs);
  }

  async function startFixLoop() {
    const player = playbackPlayerRef.current;
    const issue = latestSession?.topIssue;
    if (!player || !issue) {
      return;
    }

    setActiveFixLoop(issue);
    setFixLoopReps(0);
    const forcedTempo = practiceInterruption?.forcedTempoBpm ?? issue.targetTempoBpm;
    player.playbackRate = latestSession?.detectedTempoBpm ? Math.min(1, forcedTempo / latestSession.detectedTempoBpm) : 0.7;
    await player.seekTo(issue.segmentStartMs / 1000);
    player.play();
    setIsPlayingBack(true);
    setPlaybackPositionMs(issue.segmentStartMs);
  }

  async function stopFixLoop() {
    const player = playbackPlayerRef.current;
    if (!player) {
      setActiveFixLoop(null);
      return;
    }

    player.pause();
    player.playbackRate = 1;
    setIsPlayingBack(false);
    setActiveFixLoop(null);
    setFixLoopReps(0);
  }

  function completeFixRep() {
    if (!activeFixLoop) {
      return;
    }

    setFixLoopReps((current) => {
      const next = current + 1;
      if (next >= activeFixLoop.requiredCorrectReps) {
        void stopFixLoop();
      }
      return next;
    });
  }

  async function importPracticeTarget() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: [
          "application/vnd.recordare.musicxml+xml",
          "application/xml",
          "text/xml",
          "audio/midi",
          "audio/x-midi",
          "*/*"
        ]
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const file = new File(asset.uri);
      const extension = asset.name.split(".").pop()?.toLowerCase();
      let target: PracticeTarget | null = null;

      if (extension === "xml" || extension === "musicxml") {
        target = parseMusicXmlToTarget(await file.text(), asset.name);
      } else if (extension === "mid" || extension === "midi") {
        target = parseMidiToTarget(await file.bytes(), asset.name);
      } else {
        setStatusMessage({
          tone: "warning",
          message: "Import a MusicXML, XML, MID, or MIDI file as the comparison target."
        });
        return;
      }

      if (!target || target.expectedNoteLabels.length === 0) {
        setStatusMessage({
          tone: "warning",
          message: "That file did not contain readable target notes."
        });
        return;
      }

      const nextTargets = [target, ...importedTargets].slice(0, 16);
      setImportedTargets(nextTargets);
      setSelectedTargetId(target.id);
      await saveTargets(nextTargets);
      setStatusMessage({
        tone: "info",
        message: `${target.name} is ready as a comparison target.`
      });
    } catch {
      setStatusMessage({
        tone: "error",
        message: "The target file could not be imported. Try another MusicXML or MIDI file."
      });
    }
  }

  const value: PracticeContextValue = {
    permissionGranted,
    isRecording: recorderState.isRecording,
    isAnalyzing,
    analysisProgress,
    practiceMode,
    selectedScaleTargetId,
    selectedTargetId,
    liveWaveform,
    liveMetrics,
    dashboardMetrics,
    todayFocus,
    latestSession,
    history,
    twinProfile,
    practiceModes: PRACTICE_MODES,
    scaleTargets: SCALE_TARGETS,
    availableTargets,
    sessionDurationMs: recorderState.durationMillis,
    recordingExists: Boolean(recorder.uri),
    nativeRealtimeAvailable,
    playbackPositionMs,
    playbackDurationMs,
    isPlayingBack,
    liveTunerFrame,
    liveScoreFollower,
    activeFixLoop,
    fixLoopReps,
    practiceInterruption,
    statusMessage,
    startRecording,
    stopRecording,
    analyzeCurrentSession,
    setPracticeMode,
    setSelectedScaleTargetId: (scaleId) => {
      setSelectedScaleTargetId(scaleId);
      setSelectedTargetId(scaleId);
    },
    setSelectedTargetId,
    importPracticeTarget,
    togglePlayback,
    seekPlayback,
    startFixLoop,
    stopFixLoop,
    completeFixRep,
    refreshHistory
  };

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice() {
  const context = useContext(PracticeContext);
  if (!context) {
    throw new Error("usePractice must be used within PracticeProvider");
  }

  return context;
}
