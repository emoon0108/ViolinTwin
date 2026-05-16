import React, { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../theme/colors";

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function GlassCard({ children, style }: GlassCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.cyan,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    overflow: "hidden"
  }
});
