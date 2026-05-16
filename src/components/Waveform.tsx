import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

type WaveformProps = {
  bars?: number;
  compact?: boolean;
  values?: number[];
};

export function Waveform({ bars = 28, compact = false, values }: WaveformProps) {
  const animValues = useMemo(() => Array.from({ length: bars }, () => new Animated.Value(0.35)), [bars]);
  const running = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (values && values.length > 0) {
      return;
    }

    const sequence = animValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 520 + index * 20,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(value, {
            toValue: 0.25,
            duration: 520 + ((bars - index) % bars) * 16,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      )
    );

    running.current = Animated.stagger(44, sequence);
    running.current.start();

    return () => {
      running.current?.stop();
    };
  }, [animValues, bars, values]);

  if (values && values.length > 0) {
    return (
      <View style={[styles.container, compact && styles.compactContainer]}>
        {values.map((value, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              compact && styles.compactBar,
              {
                transform: [{ scaleY: clampWave(value) }],
                opacity: 0.35 + clampWave(value) * 0.65
              }
            ]}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      {animValues.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            compact && styles.compactBar,
            {
              transform: [{ scaleY: value }],
              opacity: value.interpolate({
                inputRange: [0.25, 1],
                outputRange: [0.4, 1]
              })
            }
          ]}
        />
      ))}
    </View>
  );
}

function clampWave(value: number) {
  return Math.min(1, Math.max(0.08, value));
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    height: 120
  },
  compactContainer: {
    height: 80,
    gap: 4
  },
  bar: {
    flex: 1,
    height: "100%",
    maxWidth: 10,
    borderRadius: 999,
    backgroundColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }
  },
  compactBar: {
    maxWidth: 8
  }
});
