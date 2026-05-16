import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePractice } from "../context/PracticeContext";
import { BottomNav } from "../components/BottomNav";
import { GlassCard } from "../components/GlassCard";
import { ModePill } from "../components/ModePill";
import { NeonButton } from "../components/NeonButton";
import { ScreenBackground } from "../components/ScreenBackground";
import { Waveform } from "../components/Waveform";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Practice">;

export function PracticeRecordingScreen({ navigation }: Props) {
  const {
    availableTargets,
    analyzeCurrentSession,
    analysisProgress,
    importPracticeTarget,
    isAnalyzing,
    isRecording,
    liveWaveform,
    permissionGranted,
    practiceMode,
    practiceModes,
    recordingExists,
    selectedTargetId,
    sessionDurationMs,
    setPracticeMode,
    setSelectedTargetId,
    startRecording,
    statusMessage,
    stopRecording
  } = usePractice();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(Math.floor(sessionDurationMs / 1000));
  }, [sessionDurationMs]);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  const canAnalyze = (recordingExists || isRecording) && !isAnalyzing;
  const analyzeLabel = isAnalyzing
    ? `Analyzing ${Math.round(analysisProgress * 100)}%`
    : recordingExists || isRecording
      ? "Analyze Session"
      : "Record First";

  return (
    <ScreenBackground>
      <Text style={styles.heading}>Practice Capture</Text>
      <Text style={styles.subheading}>Record a session and stream it into the twin model.</Text>

      <GlassCard style={styles.heroCard}>
        <Text style={styles.timer}>
          {minutes}:{remainingSeconds}
        </Text>
        <Waveform values={liveWaveform} />
        <Pressable
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          disabled={isAnalyzing}
          onPress={async () => {
            if (isRecording) {
              await stopRecording();
            } else {
              await startRecording();
            }
          }}
        >
          <View style={styles.recordCore} />
        </Pressable>
        <Text style={styles.recordCaption}>
          {permissionGranted
            ? isRecording
              ? "Recording live microphone input for twin modeling"
              : isAnalyzing
                ? "Analyzing your captured take"
              : "Tap to start a real session capture"
            : "Microphone permission is required for live analysis"}
        </Text>
      </GlassCard>

      <GlassCard style={styles.modeCard}>
        <Text style={styles.sectionTitle}>Practice Mode</Text>
        <View style={styles.modeList}>
          {practiceModes.map((mode) => (
            <ModePill
              key={mode}
              label={mode}
              active={practiceMode === mode}
              onPress={() => setPracticeMode(mode)}
            />
          ))}
        </View>
        <Text style={styles.subSectionTitle}>Comparison Target</Text>
        <View style={styles.modeList}>
          {availableTargets.map((target) => (
            <ModePill
              key={target.id}
              label={target.name}
              active={selectedTargetId === target.id}
              onPress={() => setSelectedTargetId(target.id)}
            />
          ))}
        </View>
        <Pressable style={styles.importButton} onPress={() => void importPracticeTarget()}>
          <Text style={styles.importButtonText}>Import MusicXML or MIDI</Text>
        </Pressable>
      </GlassCard>

      {statusMessage ? (
        <View style={[styles.statusBanner, styles[`statusBanner${statusMessage.tone}`]]}>
          <Text style={styles.statusText}>{statusMessage.message}</Text>
        </View>
      ) : null}

      <NeonButton
        label={analyzeLabel}
        onPress={async () => {
          const analyzed = await analyzeCurrentSession();
          if (analyzed) {
            navigation.navigate("Analysis");
          }
        }}
        variant={canAnalyze ? "primary" : "secondary"}
        disabled={!canAnalyze}
      />

      <BottomNav active="Practice" onNavigate={(key) => navigation.navigate(key)} />
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
  heroCard: {
    alignItems: "center",
    marginBottom: 18
  },
  timer: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 18
  },
  recordButton: {
    width: 108,
    height: 108,
    borderRadius: 999,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(79,213,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(79,213,255,0.3)",
    shadowColor: colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }
  },
  recordButtonActive: {
    backgroundColor: "rgba(208,75,255,0.18)",
    borderColor: "rgba(208,75,255,0.4)",
    shadowColor: colors.magenta
  },
  recordCore: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.cyan
  },
  recordCaption: {
    color: colors.textMuted,
    marginTop: 14,
    fontSize: 13,
    textAlign: "center"
  },
  modeCard: {
    marginBottom: 18
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16
  },
  modeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  subSectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 12
  },
  importButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border
  },
  importButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700"
  },
  statusBanner: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  statusBannerinfo: {
    backgroundColor: "rgba(79,213,255,0.1)",
    borderColor: "rgba(79,213,255,0.28)"
  },
  statusBannerwarning: {
    backgroundColor: "rgba(255,183,98,0.1)",
    borderColor: "rgba(255,183,98,0.32)"
  },
  statusBannererror: {
    backgroundColor: "rgba(208,75,255,0.1)",
    borderColor: "rgba(208,75,255,0.32)"
  },
  statusText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
  }
});
