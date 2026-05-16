import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Tone = "warning" | "success" | "cyan";

type MetricRowProps = {
  label: string;
  value: string;
  tone: Tone;
};

const toneMap = {
  warning: colors.warning,
  success: colors.success,
  cyan: colors.cyan
};

export function MetricRow({ label, value, tone }: MetricRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: toneMap[tone] }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)"
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14
  },
  value: {
    fontSize: 15,
    fontWeight: "700"
  }
});
