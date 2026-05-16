import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type NavKey = "Home" | "Practice" | "Analysis" | "Feedback" | "Profile";

type BottomNavProps = {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
};

const items: { key: NavKey; label: string }[] = [
  { key: "Home", label: "Home" },
  { key: "Practice", label: "Practice" },
  { key: "Analysis", label: "Live" },
  { key: "Feedback", label: "Report" },
  { key: "Profile", label: "Twin" }
];

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <View style={styles.shell}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Pressable key={item.key} onPress={() => onNavigate(item.key)} style={styles.item}>
            <View style={[styles.dot, isActive && styles.activeDot]} />
            <Text style={[styles.label, isActive && styles.activeLabel]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    padding: 14,
    borderRadius: 24,
    backgroundColor: "rgba(10, 18, 34, 0.94)",
    borderWidth: 1,
    borderColor: colors.border
  },
  item: {
    alignItems: "center",
    gap: 8,
    flex: 1
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  activeDot: {
    backgroundColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }
  },
  label: {
    fontSize: 12,
    color: colors.textMuted
  },
  activeLabel: {
    color: colors.textPrimary
  }
});
