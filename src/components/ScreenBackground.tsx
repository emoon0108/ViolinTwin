import { LinearGradient } from "expo-linear-gradient";
import React, { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

type ScreenBackgroundProps = PropsWithChildren<{
  scrollable?: boolean;
}>;

export function ScreenBackground({ children, scrollable = true }: ScreenBackgroundProps) {
  const content = (
    <View style={styles.inner}>
      <LinearGradient colors={["rgba(79,213,255,0.15)", "transparent"]} style={styles.glowTop} />
      <LinearGradient colors={["rgba(138,108,255,0.18)", "transparent"]} style={styles.glowBottom} />
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {scrollable ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    flexGrow: 1
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: colors.background
  },
  glowTop: {
    position: "absolute",
    top: -140,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 999
  },
  glowBottom: {
    position: "absolute",
    bottom: -120,
    left: -30,
    width: 260,
    height: 260,
    borderRadius: 999
  }
});
