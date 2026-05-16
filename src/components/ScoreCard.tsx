import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GlassCard } from "./GlassCard";
import { colors } from "../theme/colors";

type Accent = "cyan" | "violet" | "magenta";

type ScoreCardProps = {
  label: string;
  value: string;
  accent: Accent;
};

const accentMap = {
  cyan: colors.cyan,
  violet: colors.violet,
  magenta: colors.magenta
};

export function ScoreCard({ label, value, accent }: ScoreCardProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={[styles.accentDot, { backgroundColor: accentMap[accent] }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accentMap[accent] }]}>{value}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 120,
    justifyContent: "space-between"
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    marginBottom: 18
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  value: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 12
  }
});
