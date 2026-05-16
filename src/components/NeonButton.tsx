import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

type NeonButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
};

export function NeonButton({ label, onPress, variant = "primary", disabled = false }: NeonButtonProps) {
  const gradientColors =
    disabled
      ? (["rgba(110,128,159,0.18)", "rgba(110,128,159,0.1)"] as const)
      : variant === "primary"
      ? ([colors.cyan, colors.violet] as const)
      : (["rgba(79,213,255,0.16)", "rgba(138,108,255,0.16)"] as const);

  return (
    <Pressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        <Text style={[styles.label, (variant === "secondary" || disabled) && styles.secondaryLabel]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 22,
    shadowColor: colors.cyan,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }]
  },
  disabled: {
    elevation: 0,
    shadowOpacity: 0.08
  },
  gradient: {
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  secondaryLabel: {
    color: colors.textPrimary
  }
});
