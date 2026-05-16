import React, { useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type PlaybackScrubberProps = {
  durationMs: number;
  positionMs: number;
  isPlaying: boolean;
  onToggle: () => void;
  onSeek: (positionMs: number) => void;
};

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function PlaybackScrubber({
  durationMs,
  positionMs,
  isPlaying,
  onToggle,
  onSeek
}: PlaybackScrubberProps) {
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const [scrubberWidth, setScrubberWidth] = useState(0);

  function handleSeek(event: GestureResponderEvent) {
    const x = event.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, scrubberWidth)));
    onSeek(Math.round(durationMs * ratio));
  }

  function handleLayout(event: LayoutChangeEvent) {
    setScrubberWidth(event.nativeEvent.layout.width);
  }

  return (
    <View>
      <View style={styles.row}>
        <Pressable onPress={onToggle} style={styles.playButton}>
          <Text style={styles.playButtonText}>{isPlaying ? "Pause" : "Play"}</Text>
        </Pressable>
        <Text style={styles.timeText}>
          {formatTime(positionMs)} / {formatTime(durationMs)}
        </Text>
      </View>
      <Pressable onPress={handleSeek} style={styles.scrubberShell} onLayout={handleLayout}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.progressThumb, { left: `${Math.max(0, progress * 100 - 2)}%` }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  playButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(79,213,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(79,213,255,0.28)"
  },
  playButtonText: {
    color: colors.textPrimary,
    fontWeight: "700"
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: 13
  },
  scrubberShell: {
    height: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    position: "relative"
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.cyan
  },
  progressThumb: {
    position: "absolute",
    top: -3,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.textPrimary
  }
});
