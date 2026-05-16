import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

type ModePillProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export function ModePill({ label, active, onPress }: ModePillProps) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.activePill]}>
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)"
  },
  activePill: {
    backgroundColor: colors.cyanSoft,
    borderColor: "rgba(79,213,255,0.4)"
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600"
  },
  activeLabel: {
    color: colors.textPrimary
  }
});
