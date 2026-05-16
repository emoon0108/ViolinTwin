import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomNav } from "../components/BottomNav";
import { GlassCard } from "../components/GlassCard";
import { IntonationRibbon } from "../components/IntonationRibbon";
import { ScreenBackground } from "../components/ScreenBackground";
import { ViolinIntonationHeatmap } from "../components/ViolinIntonationHeatmap";
import { usePractice } from "../context/PracticeContext";
import {
  buildBowEvidence,
  buildGrowthSnapshot,
  buildIntonationRibbon,
  buildTwinDiagnostics
} from "../lib/digitalTwinDashboard";
import { buildHeatmapSamplesFromSession } from "../lib/intonationHeatmap";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export function DigitalTwinProfileScreen({ navigation }: Props) {
  const { latestSession, history, twinProfile } = usePractice();
  const chartValues = twinProfile.chartValues.length > 0 ? twinProfile.chartValues : [36, 44, 52, 48, 58, 63];

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
  const ribbonPoints = useMemo(() => (latestSession ? buildIntonationRibbon(latestSession) : []), [latestSession]);
  const diagnostics = useMemo(
    () => (latestSession ? buildTwinDiagnostics({ latestSession, history }) : []),
    [history, latestSession]
  );
  const bowEvidence = useMemo(() => (latestSession ? buildBowEvidence(latestSession) : []), [latestSession]);
  const growth = useMemo(
    () => (latestSession ? buildGrowthSnapshot({ latestSession, history }) : null),
    [history, latestSession]
  );

  return (
    <ScreenBackground>
      <Text style={styles.heading}>Digital Twin</Text>
      <Text style={styles.subheading}>A visual autopsy of where your intonation landed, when it slipped, and what likely caused it.</Text>

      <GlassCard style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>Twin Confidence</Text>
            <Text style={styles.heroValue}>{twinProfile.twinConfidence}</Text>
          </View>
          <View>
            <Text style={styles.heroLabel}>Sessions Analyzed</Text>
            <Text style={styles.heroMinor}>{twinProfile.sessionsAnalyzed}</Text>
          </View>
        </View>

        <View style={styles.chartShell}>
          {chartValues.map((value, index) => (
            <View key={`${value}-${index}`} style={[styles.chartBar, { height: 40 + value }]} />
          ))}
        </View>
        <Text style={styles.heroMeta}>
          {latestSession?.dominantNoteLabel
            ? `Recent dominant note region: ${latestSession.dominantNoteLabel}`
            : "Record another session to start stabilizing the twin's pitch footprint."}
        </Text>
      </GlassCard>

      {heatmapSamples.length > 0 ? (
        <GlassCard style={styles.primaryCard}>
          <ViolinIntonationHeatmap
            data={heatmapSamples}
            title="Fingerboard Ghost"
            focusLabel={latestSession?.targetName ?? "Session Focus"}
            width={320}
            height={520}
          />
        </GlassCard>
      ) : null}

      {ribbonPoints.length > 0 ? (
        <GlassCard style={styles.primaryCard}>
          <IntonationRibbon points={ribbonPoints} title="Intonation Ribbon" width={320} height={220} />
        </GlassCard>
      ) : null}

      {diagnostics.length > 0 ? (
        <GlassCard style={styles.listCard}>
          <Text style={styles.sectionTitle}>Muscle Memory Diagnostic</Text>
          {diagnostics.map((item) => (
            <View key={item.title} style={styles.diagnosticRow}>
              <Text style={[styles.diagnosticTitle, item.tone === "warning" ? styles.warningTone : item.tone === "violet" ? styles.violetTone : styles.cyanTone]}>
                {item.title}
              </Text>
              <Text style={styles.diagnosticBody}>{item.body}</Text>
            </View>
          ))}
        </GlassCard>
      ) : null}

      {growth ? (
        <GlassCard style={styles.listCard}>
          <Text style={styles.sectionTitle}>Growth Comparison</Text>
          <View style={styles.growthRow}>
            <View style={styles.growthMetric}>
              <Text style={styles.growthLabel}>Consistency Score</Text>
              <Text style={styles.growthValue}>{growth.currentConsistencyScore}</Text>
            </View>
            <View style={styles.growthMetric}>
              <Text style={styles.growthLabel}>Previous</Text>
              <Text style={styles.growthMinor}>{growth.previousConsistencyScore ?? "--"}</Text>
            </View>
            <View style={styles.growthMetric}>
              <Text style={styles.growthLabel}>Delta</Text>
              <Text style={[styles.growthMinor, growth.delta !== null && growth.delta >= 0 ? styles.cyanTone : styles.warningTone]}>
                {growth.delta === null ? "--" : `${growth.delta > 0 ? "+" : ""}${growth.delta}`}
              </Text>
            </View>
          </View>
          <Text style={styles.growthBody}>{growth.message}</Text>
          <Text style={styles.growthFootnote}>
            Current blur: {growth.currentSpreadCents.toFixed(1)} cents
            {growth.previousSpreadCents !== null ? ` · previous blur: ${growth.previousSpreadCents.toFixed(1)} cents` : ""}
          </Text>
        </GlassCard>
      ) : null}

      {bowEvidence.length > 0 ? (
        <GlassCard style={styles.secondaryCard}>
          <Text style={styles.sectionTitle}>Bowing Causal Evidence</Text>
          <Text style={styles.secondaryIntro}>Secondary layer: use these bow metrics to explain the pitch footprint, not to replace it.</Text>
          {bowEvidence.map((item) => (
            <View key={item.title} style={styles.bowRow}>
              <View style={styles.bowTag}>
                <Text style={styles.bowTagText}>{item.title}</Text>
              </View>
              <View style={styles.bowBodyWrap}>
                <Text style={styles.bowValue}>{item.value}</Text>
                <Text style={styles.bowExplanation}>{item.explanation}</Text>
              </View>
            </View>
          ))}
        </GlassCard>
      ) : null}

      <GlassCard style={styles.listCard}>
        <Text style={styles.sectionTitle}>Strengths</Text>
        {twinProfile.strengths.map((item) => (
          <Text key={item} style={styles.listText}>
            - {item}
          </Text>
        ))}
      </GlassCard>

      <GlassCard style={styles.listCard}>
        <Text style={styles.sectionTitle}>Weakness Patterns</Text>
        {twinProfile.weakPatterns.map((item) => (
          <Text key={item} style={styles.listText}>
            - {item}
          </Text>
        ))}
      </GlassCard>

      <BottomNav active="Profile" onNavigate={(key) => navigation.navigate(key)} />
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
    marginBottom: 18
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: 13
  },
  heroValue: {
    color: colors.cyan,
    fontSize: 34,
    fontWeight: "800",
    marginTop: 8
  },
  heroMinor: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "right"
  },
  chartShell: {
    height: 160,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingTop: 12
  },
  chartBar: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: colors.violet,
    shadowColor: colors.violet,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }
  },
  heroMeta: {
    color: colors.cyan,
    marginTop: 14,
    fontSize: 14,
    fontWeight: "600"
  },
  primaryCard: {
    marginBottom: 16,
    padding: 0,
    overflow: "hidden"
  },
  secondaryCard: {
    marginBottom: 16,
    backgroundColor: "rgba(12,24,46,0.76)"
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
  diagnosticRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)"
  },
  diagnosticTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  diagnosticBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  growthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14
  },
  growthMetric: {
    flex: 1
  },
  growthLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 6
  },
  growthValue: {
    color: colors.cyan,
    fontSize: 30,
    fontWeight: "800"
  },
  growthMinor: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "700"
  },
  growthBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  growthFootnote: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 10
  },
  secondaryIntro: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6
  },
  bowRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)"
  },
  bowTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 8
  },
  bowTagText: {
    color: colors.violet,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  bowBodyWrap: {
    gap: 6
  },
  bowValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700"
  },
  bowExplanation: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  listText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 4
  },
  cyanTone: {
    color: colors.cyan
  },
  violetTone: {
    color: colors.violet
  },
  warningTone: {
    color: colors.warning
  }
});
