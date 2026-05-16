import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomNav } from "../components/BottomNav";
import { GlassCard } from "../components/GlassCard";
import { NeonButton } from "../components/NeonButton";
import { PitchGraph } from "../components/PitchGraph";
import { PlaybackScrubber } from "../components/PlaybackScrubber";
import { ScoreCard } from "../components/ScoreCard";
import { ScreenBackground } from "../components/ScreenBackground";
import { ViolinIntonationHeatmap } from "../components/ViolinIntonationHeatmap";
import { usePractice } from "../context/PracticeContext";
import { buildHeatmapSamplesFromSession } from "../lib/intonationHeatmap";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Feedback">;

export function FeedbackReportScreen({ navigation }: Props) {
  const {
    activeFixLoop,
    completeFixRep,
    fixLoopReps,
    isPlayingBack,
    latestSession,
    playbackDurationMs,
    playbackPositionMs,
    practiceInterruption,
    seekPlayback,
    startFixLoop,
    stopFixLoop,
    togglePlayback
  } = usePractice();

  const heatmapSamples = useMemo(
    () =>
      latestSession
        ? buildHeatmapSamplesFromSession({
            targetName: latestSession.targetName,
            targetComparisons: latestSession.targetComparisons
          })
        : [],
    [latestSession]
  );

  if (!latestSession) {
    return (
      <ScreenBackground>
        <Text style={styles.heading}>Session Report</Text>
        <Text style={styles.subheading}>Record and analyze a session to generate a real feedback report.</Text>
        <GlassCard>
          <Text style={styles.drillText}>
            ViolinTwin does not have a finished report yet because no microphone-backed session has been analyzed.
          </Text>
        </GlassCard>
        <BottomNav active="Feedback" onNavigate={(key) => navigation.navigate(key)} />
      </ScreenBackground>
    );
  }

  const metrics = [
    { label: "Pitch Accuracy", value: `${latestSession.pitchAccuracy}%`, accent: "cyan" as const },
    { label: "Rhythm Accuracy", value: `${latestSession.rhythmStability}%`, accent: "violet" as const },
    { label: "Bow Control", value: `${latestSession.bowControl}%`, accent: "magenta" as const }
  ];

  return (
    <ScreenBackground>
      <Text style={styles.heading}>Session Report</Text>
      <Text style={styles.subheading}>
        {latestSession.targetName
          ? `Post-session corrections generated against the ${latestSession.targetName} target.`
          : "Post-session corrections generated from your current twin model."}
      </Text>

      <GlassCard style={styles.overallCard}>
        <Text style={styles.overallLabel}>Overall Score</Text>
        <Text style={styles.overallValue}>{latestSession.overallScore}</Text>
        <Text style={styles.overallMeta}>
          {latestSession.detectedTempoBpm
            ? `Detected pulse around ${latestSession.detectedTempoBpm} BPM with ${latestSession.pitchLabel.toLowerCase()} pitch drift.`
            : `Session summary generated from your microphone recording with ${latestSession.pitchLabel.toLowerCase()} as the main pitch trend.`}
        </Text>
        {latestSession.dominantNoteLabel ? (
          <Text style={styles.overallTag}>Dominant note region: {latestSession.dominantNoteLabel}</Text>
        ) : null}
      </GlassCard>

      {latestSession.topIssue ? (
        <GlassCard style={styles.fixCard}>
          {practiceInterruption ? (
            <View style={styles.interruptBanner}>
              <Text style={styles.interruptTitle}>Stop Bad Practice</Text>
              <Text style={styles.interruptText}>{practiceInterruption.message}</Text>
            </View>
          ) : null}
          <Text style={styles.fixEyebrow}>Teacher Mode</Text>
          <Text style={styles.fixTitle}>{latestSession.topIssue.title}</Text>
          <Text style={styles.fixDescription}>{latestSession.topIssue.description}</Text>
          <Text style={styles.fixCue}>{latestSession.topIssue.cue}</Text>
          <Text style={styles.fixMeta}>
            Loop target: {practiceInterruption?.forcedTempoBpm ?? latestSession.topIssue.targetTempoBpm} BPM · {latestSession.topIssue.requiredCorrectReps} correct reps required
          </Text>
          {!activeFixLoop ? (
            <NeonButton
              label={practiceInterruption ? "Slow Down and Fix" : "Fix Now"}
              onPress={() => {
                void startFixLoop();
              }}
            />
          ) : (
            <View style={styles.fixActions}>
              <Text style={styles.repCounter}>
                Correct reps: {fixLoopReps}/{activeFixLoop.requiredCorrectReps}
              </Text>
              <NeonButton label="That Rep Was Correct" onPress={completeFixRep} />
              <NeonButton
                label="Stop Loop"
                onPress={() => {
                  void stopFixLoop();
                }}
                variant="secondary"
              />
            </View>
          )}
        </GlassCard>
      ) : null}

      <View style={styles.grid}>
        {metrics.map((metric) => (
          <ScoreCard key={metric.label} {...metric} />
        ))}
      </View>

      {heatmapSamples.length > 0 ? (
        <GlassCard style={styles.heatmapCard}>
          <ViolinIntonationHeatmap
            data={heatmapSamples}
            title="Fingerboard Intonation Map"
            focusLabel={latestSession.targetName ?? "Session Focus"}
            width={320}
            height={520}
          />
        </GlassCard>
      ) : null}

      <GlassCard style={styles.listCard}>
        <Text style={styles.sectionTitle}>Top Corrections</Text>
        {latestSession.corrections.map((item, index) => (
          <View key={item} style={styles.listRow}>
            <Text style={styles.index}>{index + 1}</Text>
            <Text style={styles.listText}>{item}</Text>
          </View>
        ))}
      </GlassCard>

      <GlassCard style={styles.listCard}>
        <Text style={styles.sectionTitle}>Recommended Drill</Text>
        <Text style={styles.drillText}>{latestSession.recommendedDrill}</Text>
      </GlassCard>

      {latestSession.recordingUri ? (
        <GlassCard style={styles.listCard}>
          <Text style={styles.sectionTitle}>Playback Review</Text>
          <PlaybackScrubber
            durationMs={playbackDurationMs || latestSession.durationMs}
            positionMs={playbackPositionMs}
            isPlaying={isPlayingBack}
            onToggle={() => {
              void togglePlayback();
            }}
            onSeek={(positionMs) => {
              void seekPlayback(positionMs);
            }}
          />
        </GlassCard>
      ) : null}

      <GlassCard style={styles.listCard}>
        <Text style={styles.sectionTitle}>Pitch Graph</Text>
        <PitchGraph track={latestSession.pitchTrack} expectedNotes={latestSession.expectedNoteLabels} />
      </GlassCard>

      {latestSession.detectedNotes.length > 0 ? (
        <GlassCard style={styles.listCard}>
          <Text style={styles.sectionTitle}>Detected Notes</Text>
          {latestSession.detectedNotes.slice(0, 5).map((note) => (
            <View key={`${note.noteLabel}-${note.startMs}`} style={styles.noteRow}>
              <View>
                <Text style={styles.noteLabel}>{note.noteLabel}</Text>
                <Text style={styles.noteMeta}>
                  {Math.round(note.durationMs)} ms · {note.averagePitchHz.toFixed(1)} Hz
                </Text>
              </View>
              <Text
                style={[
                  styles.noteOffset,
                  { color: Math.abs(note.averageCentsOffset) <= 10 ? colors.success : colors.warning }
                ]}
              >
                {note.averageCentsOffset > 0 ? "+" : ""}
                {Math.round(note.averageCentsOffset)}c
              </Text>
            </View>
          ))}
        </GlassCard>
      ) : null}

      {latestSession.targetComparisons.length > 0 ? (
        <GlassCard style={styles.listCard}>
          <Text style={styles.sectionTitle}>Scale Target Match</Text>
          {latestSession.targetComparisons.map((comparison) => (
            <View key={`${comparison.expectedNoteLabel}-${comparison.playedNoteLabel ?? "miss"}`} style={styles.noteRow}>
              <View>
                <Text style={styles.noteLabel}>
                  {comparison.expectedNoteLabel} {"->"} {comparison.playedNoteLabel ?? "--"}
                </Text>
                <Text style={styles.noteMeta}>
                  m.{comparison.measureNumber} beat {comparison.beatInMeasure}
                  {comparison.subdivisionLabel !== "downbeat" ? ` (${comparison.subdivisionLabel})` : ""} ·{" "}
                  {comparison.timingDeltaMs === null
                    ? comparison.matched
                      ? "Matched target note"
                      : "Wrong target note or missing segment"
                    : `${comparison.rhythmicLabel} · ${comparison.timingDeltaMs > 0 ? "+" : ""}${comparison.timingDeltaMs} ms vs target timing`}
                </Text>
              </View>
              <Text
                style={[
                  styles.noteOffset,
                  {
                    color:
                      comparison.centsFromTarget === null
                        ? colors.textMuted
                        : Math.abs(comparison.centsFromTarget) <= 10
                          ? colors.success
                          : colors.warning
                  }
                ]}
              >
                {comparison.centsFromTarget === null
                  ? "--"
                  : `${comparison.centsFromTarget > 0 ? "+" : ""}${Math.round(comparison.centsFromTarget)}c`}
              </Text>
            </View>
          ))}
        </GlassCard>
      ) : null}

      <NeonButton label="Open Digital Twin" onPress={() => navigation.navigate("Profile")} variant="secondary" />

      <BottomNav active="Feedback" onNavigate={(key) => navigation.navigate(key)} />
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
  overallCard: {
    marginBottom: 18,
    alignItems: "center"
  },
  overallLabel: {
    color: colors.textSecondary,
    fontSize: 14
  },
  overallValue: {
    color: colors.cyan,
    fontSize: 54,
    fontWeight: "800",
    marginVertical: 10
  },
  overallMeta: {
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22
  },
  overallTag: {
    color: colors.cyan,
    marginTop: 10,
    fontSize: 14,
    fontWeight: "600"
  },
  interruptBanner: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,183,98,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,183,98,0.35)"
  },
  interruptTitle: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  interruptText: {
    color: colors.textPrimary,
    lineHeight: 21,
    fontSize: 14
  },
  fixCard: {
    marginBottom: 18
  },
  fixEyebrow: {
    color: colors.warning,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 10
  },
  fixTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8
  },
  fixDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10
  },
  fixCue: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12
  },
  fixMeta: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 16
  },
  fixActions: {
    gap: 12
  },
  repCounter: {
    color: colors.success,
    fontSize: 15,
    fontWeight: "700"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 18
  },
  heatmapCard: {
    marginBottom: 18,
    padding: 0,
    overflow: "hidden"
  },
  listCard: {
    marginBottom: 16
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14
  },
  listRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12
  },
  index: {
    color: colors.cyan,
    fontSize: 15,
    fontWeight: "700",
    width: 20
  },
  listText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  drillText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)"
  },
  noteLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700"
  },
  noteMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 19
  },
  noteOffset: {
    fontSize: 16,
    fontWeight: "800"
  }
});
