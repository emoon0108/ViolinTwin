import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomNav } from "../components/BottomNav";
import { GlassCard } from "../components/GlassCard";
import { MetricRow } from "../components/MetricRow";
import { NeonButton } from "../components/NeonButton";
import { ScreenBackground } from "../components/ScreenBackground";
import { Waveform } from "../components/Waveform";
import { usePractice } from "../context/PracticeContext";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Analysis">;

function formatSignedMs(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${Math.round(value)} ms`;
}

export function RealTimeAnalysisScreen({ navigation }: Props) {
  const {
    analysisProgress,
    isAnalyzing,
    isRecording,
    latestSession,
    liveMetrics,
    liveScoreFollower,
    liveTunerFrame,
    liveWaveform,
    nativeRealtimeAvailable
  } = usePractice();

  return (
    <ScreenBackground>
      <Text style={styles.heading}>Live Analysis</Text>
      <Text style={styles.subheading}>
        {isRecording
          ? "Live tuner and score-following are listening now."
          : isAnalyzing
          ? "Running post-session audio analysis from your recorded take."
          : "Latest live and post-pass metrics from your microphone sessions."}
      </Text>

      <GlassCard style={styles.metricsCard}>
        {liveMetrics.map((metric) => (
          <MetricRow key={metric.label} {...metric} />
        ))}
      </GlassCard>

      <GlassCard style={styles.tunerCard}>
        <Text style={styles.sectionTitle}>Realtime Tuner</Text>
        <Text style={styles.tunerBadge}>{nativeRealtimeAvailable ? "Native low-latency stream" : "Expo Go fallback mode"}</Text>
        <View style={styles.tunerRow}>
          <View>
            <Text style={styles.tunerValue}>{liveTunerFrame?.noteLabel ?? "--"}</Text>
            <Text style={styles.tunerSubvalue}>{liveTunerFrame?.pitchHz ? `${liveTunerFrame.pitchHz.toFixed(1)} Hz` : "Waiting for pitch"}</Text>
          </View>
          <View style={styles.tunerRight}>
            <Text style={[styles.centsValue, liveTunerFrame?.matched ? styles.goodText : styles.warnText]}>
              {liveTunerFrame?.centsFromTarget !== null && liveTunerFrame?.centsFromTarget !== undefined
                ? `${liveTunerFrame.centsFromTarget > 0 ? "+" : ""}${Math.round(liveTunerFrame.centsFromTarget)}c`
                : liveTunerFrame?.centsOffset !== null && liveTunerFrame?.centsOffset !== undefined
                ? `${liveTunerFrame.centsOffset > 0 ? "+" : ""}${Math.round(liveTunerFrame.centsOffset)}c`
                : "--"}
            </Text>
            <Text style={styles.tunerSubvalue}>Confidence {liveTunerFrame?.confidence ?? 0}%</Text>
          </View>
        </View>
        <Text style={styles.statusText}>{liveTunerFrame?.statusLabel ?? "Start a recording to see live note-by-note tuning."}</Text>
      </GlassCard>

      <GlassCard style={styles.followCard}>
        <Text style={styles.sectionTitle}>Score Follower</Text>
        <Text style={styles.followLabel}>{liveScoreFollower?.currentMeasureLabel ?? "Waiting for score position"}</Text>
        <View style={styles.progressShell}>
          <View
            style={[
              styles.progressBar,
              { width: `${Math.max(8, Math.round((liveScoreFollower?.progress ?? analysisProgress) * 100))}%` }
            ]}
          />
        </View>
        <View style={styles.followStats}>
          <Text style={styles.followMeta}>
            Target: {liveTunerFrame?.targetNoteLabel ?? liveScoreFollower?.currentExpectedNoteLabel ?? "--"}
          </Text>
          <Text style={styles.followMeta}>
            Timing: {formatSignedMs(liveTunerFrame?.timingDeltaMs ?? null)}
          </Text>
        </View>
        <Text style={styles.followSummary}>
          {liveScoreFollower
            ? `${liveScoreFollower.matchedNotes}/${liveScoreFollower.totalExpectedNotes} notes aligned · ${liveScoreFollower.alignmentConfidence}% follow confidence.`
            : latestSession
            ? `${latestSession.detectedNotes.length} segmented notes and ${latestSession.targetComparisons.length} target matches in the latest report.`
            : "Import or select a target, then record to watch the score follower advance note by note."}
        </Text>
        <Text style={styles.followTracking}>{liveScoreFollower?.trackingLabel ?? "The follower will lock measure and beat labels once stable pitch arrives."}</Text>
      </GlassCard>

      <GlassCard style={styles.twinCard}>
        <Text style={styles.sectionTitle}>Digital Twin Builder</Text>
        <Text style={styles.twinLabel}>{isRecording ? "Synchronizing live habits" : isAnalyzing ? "Sampling recorded audio frames" : "Twin model on standby"}</Text>
        <Waveform compact values={latestSession?.waveform ?? liveWaveform} />
        <Text style={styles.twinMeta}>
          {latestSession
            ? `Detected pitch center ${latestSession.detectedPitchHz ? `${latestSession.detectedPitchHz} Hz` : "still calibrating"}, with ${latestSession.pitchAccuracy}% pitch accuracy and ${latestSession.detectedNotes.length} segmented note events.`
            : nativeRealtimeAvailable
            ? "Realtime frames come from the native audio engine, while the full report still runs a post-session pass over recorded audio."
            : "Expo Go shows the JS fallback. For true low-latency live tuner frames, run a custom dev build with the local native engine enabled."}
        </Text>
      </GlassCard>

      <NeonButton label="View Report" onPress={() => navigation.navigate("Feedback")} variant={latestSession ? "primary" : "secondary"} />

      <BottomNav active="Analysis" onNavigate={(key) => navigation.navigate(key)} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: "800"
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 18
  },
  metricsCard: {
    marginBottom: 18
  },
  tunerCard: {
    marginBottom: 18
  },
  followCard: {
    marginBottom: 18
  },
  twinCard: {
    marginBottom: 18
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8
  },
  tunerBadge: {
    color: colors.cyan,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 14
  },
  tunerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  tunerValue: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: "800"
  },
  tunerRight: {
    alignItems: "flex-end"
  },
  centsValue: {
    fontSize: 28,
    fontWeight: "800"
  },
  tunerSubvalue: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: 13
  },
  statusText: {
    color: colors.textPrimary,
    marginTop: 14,
    lineHeight: 21
  },
  goodText: {
    color: colors.cyan
  },
  warnText: {
    color: colors.magenta
  },
  followLabel: {
    color: colors.violet,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 14
  },
  progressShell: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden"
  },
  progressBar: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.violet
  },
  followStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12
  },
  followMeta: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600"
  },
  followSummary: {
    color: colors.textSecondary,
    marginTop: 12,
    lineHeight: 21
  },
  followTracking: {
    color: colors.cyan,
    marginTop: 10,
    lineHeight: 20,
    fontSize: 13,
    fontWeight: "600"
  },
  twinLabel: {
    color: colors.cyan,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 16
  },
  twinMeta: {
    color: colors.textSecondary,
    marginTop: 14,
    lineHeight: 22
  }
});
