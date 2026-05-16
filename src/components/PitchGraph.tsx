import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PitchTrackPoint } from "../types/violin";
import { colors } from "../theme/colors";

type PitchGraphProps = {
  track: PitchTrackPoint[];
  expectedNotes?: string[];
};

export function PitchGraph({ track, expectedNotes = [] }: PitchGraphProps) {
  const values = track
    .map((point) => point.centsOffset)
    .filter((value): value is number => value !== null)
    .slice(0, 40);

  if (values.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Pitch graph will appear after the session produces stable note frames.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.scaleLabels}>
        <Text style={styles.scaleText}>+25c</Text>
        <Text style={styles.scaleText}>0</Text>
        <Text style={styles.scaleText}>-25c</Text>
      </View>
      <View style={styles.graphShell}>
        <View style={[styles.guideLine, styles.topLine]} />
        <View style={[styles.guideLine, styles.centerLine]} />
        <View style={[styles.guideLine, styles.bottomLine]} />
        <View style={styles.barRow}>
          {values.map((value, index) => {
            const offset = Math.max(-25, Math.min(25, value));
            const topPercent = 50 - (offset / 50) * 100;
            return (
              <View key={`${index}-${offset}`} style={styles.barSlot}>
                <View
                  style={[
                    styles.point,
                    {
                      top: `${topPercent}%`,
                      backgroundColor: Math.abs(value) <= 10 ? colors.success : colors.warning
                    }
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>
      {expectedNotes.length > 0 ? (
        <Text style={styles.targetCaption}>Target path: {expectedNotes.join(" - ")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    paddingVertical: 20,
    alignItems: "center"
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20
  },
  scaleLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10
  },
  scaleText: {
    color: colors.textMuted,
    fontSize: 12
  },
  graphShell: {
    height: 132,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
    position: "relative"
  },
  guideLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  topLine: {
    top: "20%"
  },
  centerLine: {
    top: "50%",
    backgroundColor: "rgba(79,213,255,0.24)"
  },
  bottomLine: {
    top: "80%"
  },
  barRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 4
  },
  barSlot: {
    flex: 1,
    position: "relative"
  },
  point: {
    position: "absolute",
    width: "100%",
    height: 6,
    borderRadius: 999,
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 }
  },
  targetCaption: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  }
});
