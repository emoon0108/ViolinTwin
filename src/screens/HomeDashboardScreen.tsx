import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { usePractice } from "../context/PracticeContext";
import { BottomNav } from "../components/BottomNav";
import { GlassCard } from "../components/GlassCard";
import { NeonButton } from "../components/NeonButton";
import { ScoreCard } from "../components/ScoreCard";
import { ScreenBackground } from "../components/ScreenBackground";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeDashboardScreen({ navigation }: Props) {
  const { dashboardMetrics, todayFocus, latestSession, twinProfile } = usePractice();

  return (
    <ScreenBackground>
      <Text style={styles.eyebrow}>AI VIOLIN COACH</Text>
      <Text style={styles.title}>ViolinTwin</Text>
      <Text style={styles.subtitle}>Your AI practice teacher</Text>

      <NeonButton label="Start Practice" onPress={() => navigation.navigate("Practice")} />

      <View style={styles.grid}>
        {dashboardMetrics.map((metric) => (
          <ScoreCard key={metric.label} {...metric} />
        ))}
      </View>

      <GlassCard style={styles.focusCard}>
        <Text style={styles.sectionTitle}>Today&apos;s Focus</Text>
        {todayFocus.map((item) => (
          <View key={item} style={styles.focusItem}>
            <View style={styles.focusBullet} />
            <Text style={styles.focusText}>{item}</Text>
          </View>
        ))}
      </GlassCard>

      <GlassCard>
        <Text style={styles.sectionTitle}>Twin Snapshot</Text>
        <Text style={styles.snapshotText}>
          {latestSession
            ? `Latest session: ${latestSession.pitchLabel.toLowerCase()}, ${latestSession.rhythmLabel.toLowerCase()}, and twin confidence at ${twinProfile.twinConfidence}.`
            : "Record your first session to generate a real ViolinTwin baseline from your microphone input."}
        </Text>
      </GlassCard>

      <BottomNav active="Home" onNavigate={(key) => navigation.navigate(key)} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.cyan,
    letterSpacing: 2.4,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 10
  },
  title: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 8,
    marginBottom: 24
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 18,
    marginBottom: 18
  },
  focusCard: {
    marginBottom: 16
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14
  },
  focusItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12
  },
  focusBullet: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 7,
    backgroundColor: colors.violet
  },
  focusText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  snapshotText: {
    color: colors.textSecondary,
    lineHeight: 22,
    fontSize: 15
  }
});
