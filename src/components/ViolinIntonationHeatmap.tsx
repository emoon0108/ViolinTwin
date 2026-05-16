import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { colors } from "../theme/colors";
import {
  buildIntonationHeatmap,
  clamp,
  filterIntonationSamples,
  IntonationSample,
  summarizeHotspot,
  ViewMode
} from "../lib/intonationHeatmap";

type Props = {
  data: IntonationSample[];
  width?: number;
  height?: number;
  focusLabel?: string;
  focusPredicate?: (sample: ReturnType<typeof filterIntonationSamples>[number]) => boolean;
  initialMode?: ViewMode;
  title?: string;
};

const STRING_LABELS = ["G", "D", "A", "E"];
const TOP_PADDING = 28;
const BOTTOM_PADDING = 18;
const SIDE_PADDING = 28;
const FINGERBOARD_RADIUS = 22;

export function ViolinIntonationHeatmap({
  data,
  width = 320,
  height = 720,
  focusLabel = "G Major",
  focusPredicate,
  initialMode = "session",
  title = "Violin Intonation Heatmap"
}: Props) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);

  const filteredSamples = useMemo(
    () =>
      filterIntonationSamples({
        samples: data,
        mode,
        focusLabel,
        focusPredicate
      }),
    [data, focusLabel, focusPredicate, mode]
  );

  const cells = useMemo(() => buildIntonationHeatmap(filteredSamples), [filteredSamples]);
  const hoveredCell = useMemo(
    () => cells.find((cell) => `${cell.column}-${cell.row}` === hoveredCellKey) ?? null,
    [cells, hoveredCellKey]
  );

  const violinWidth = width - SIDE_PADDING * 2;
  const violinHeight = height - TOP_PADDING - BOTTOM_PADDING;
  const stringSpacing = violinWidth / 4;
  const densityOpacity = scaleLinear().domain([0, 0.35, 1]).range([0, 0.32, 0.92]).clamp(true);
  const centsColor = scaleLinear<string>()
    .domain([-50, -15, 0, 15, 50])
    .range(["#2D6CFF", "#58A6FF", colors.success, "#FF9A7A", "#FF4D62"])
    .clamp(true);
  const fingerExtent = extent(filteredSamples.map((sample) => sample.finger_position));

  return (
    <View style={styles.shell}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {mode === "session" ? "All detected notes" : `${focusLabel} focus filter`} · {filteredSamples.length} samples
          </Text>
        </View>
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleButton, mode === "session" && styles.toggleButtonActive]}
            onPress={() => setMode("session")}
          >
            <Text style={[styles.toggleText, mode === "session" && styles.toggleTextActive]}>Session View</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, mode === "focus" && styles.toggleButtonActive]}
            onPress={() => setMode("focus")}
          >
            <Text style={[styles.toggleText, mode === "focus" && styles.toggleTextActive]}>Focus View</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          Finger range: {fingerExtent[0] !== undefined ? fingerExtent[0].toFixed(2) : "0.00"} to {fingerExtent[1] !== undefined ? fingerExtent[1].toFixed(2) : "1.00"}
        </Text>
        <Text style={styles.metaText}>Green = in tune · Red = sharp · Blue = flat</Text>
      </View>

      <Svg width={width} height={height}>
        <Rect x={SIDE_PADDING - 10} y={TOP_PADDING - 10} width={violinWidth + 20} height={violinHeight + 20} rx={28} fill="rgba(7,17,31,0.65)" stroke={colors.border} />
        <Rect x={SIDE_PADDING} y={TOP_PADDING} width={violinWidth} height={violinHeight} rx={FINGERBOARD_RADIUS} fill="rgba(15,24,41,0.96)" stroke="rgba(255,255,255,0.05)" />

        <G>
          {cells.map((cell) => {
            const cellWidth = violinWidth * cell.width;
            const cellHeight = violinHeight * cell.height;
            const x = SIDE_PADDING + violinWidth * cell.x;
            const y = TOP_PADDING + violinHeight * cell.y;
            const key = `${cell.column}-${cell.row}`;
            const intensity = densityOpacity(cell.density);
            const fill = centsColor(cell.weightedCents);

            return (
              <Rect
                key={key}
                x={x}
                y={y}
                width={cellWidth + 0.5}
                height={cellHeight + 0.5}
                fill={fill}
                opacity={intensity}
                onPressIn={() => setHoveredCellKey(key)}
              />
            );
          })}
        </G>

        <G>
          {STRING_LABELS.map((label, index) => {
            const x = SIDE_PADDING + index * stringSpacing + stringSpacing / 2;
            return (
              <G key={label}>
                <Line x1={x} y1={TOP_PADDING} x2={x} y2={TOP_PADDING + violinHeight} stroke="rgba(255,255,255,0.22)" strokeWidth={index === 0 ? 1.8 : 1.2} />
                <SvgText x={x} y={TOP_PADDING - 8} fill={colors.textSecondary} fontSize="11" fontWeight="700" textAnchor="middle">
                  {label}
                </SvgText>
              </G>
            );
          })}
        </G>

        <Line x1={SIDE_PADDING} y1={TOP_PADDING + 10} x2={SIDE_PADDING + violinWidth} y2={TOP_PADDING + 10} stroke={colors.textPrimary} strokeWidth={4} strokeLinecap="round" />
        <Line x1={SIDE_PADDING + 10} y1={TOP_PADDING + violinHeight - 10} x2={SIDE_PADDING + violinWidth - 10} y2={TOP_PADDING + violinHeight - 10} stroke="rgba(255,255,255,0.12)" strokeWidth={3} strokeLinecap="round" />
      </Svg>

      <View style={styles.legendRow}>
        <View style={[styles.legendSwatch, { backgroundColor: "#2D6CFF" }]} />
        <Text style={styles.legendText}>Flat</Text>
        <View style={[styles.legendSwatch, { backgroundColor: colors.success }]} />
        <Text style={styles.legendText}>In Tune</Text>
        <View style={[styles.legendSwatch, { backgroundColor: "#FF4D62" }]} />
        <Text style={styles.legendText}>Sharp</Text>
      </View>

      <View style={styles.tooltipCard}>
        {hoveredCell ? (
          (() => {
            const hotspot = summarizeHotspot(hoveredCell);
            return (
              <>
                <Text style={styles.tooltipTitle}>Hot Spot</Text>
                <Text style={styles.tooltipText}>
                  String {STRING_LABELS[hotspot.stringIndex]} · position {hotspot.fingerPosition.toFixed(2)}
                </Text>
                <Text style={styles.tooltipText}>Average deviation: {hotspot.averageCentsDeviation > 0 ? "+" : ""}{hotspot.averageCentsDeviation} cents</Text>
                <Text style={styles.tooltipText}>Density: {(hotspot.density * 100).toFixed(0)}% · contributing samples: {hotspot.sampleCount}</Text>
              </>
            );
          })()
        ) : (
          <>
            <Text style={styles.tooltipTitle}>Hot Spot Inspector</Text>
            <Text style={styles.tooltipText}>Tap or hover a hot zone to inspect its average cent deviation.</Text>
          </>
        )}
      </View>
    </View>
  );
}

export function buildHeatmapColor(centsDeviation: number, density: number) {
  const opacity = clamp(density, 0, 1);
  const colorScale = scaleLinear<string>()
    .domain([-50, 0, 50])
    .range(["#2D6CFF", colors.success, "#FF4D62"])
    .clamp(true);

  return {
    fill: colorScale(centsDeviation),
    opacity
  };
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: colors.panelStrong,
    borderWidth: 1,
    borderColor: colors.border
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: 13
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-start"
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  toggleButtonActive: {
    backgroundColor: colors.cyanSoft,
    borderColor: colors.cyan
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  toggleTextActive: {
    color: colors.textPrimary
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12
  },
  legendRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 999
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginRight: 8
  },
  tooltipCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border
  },
  tooltipTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6
  },
  tooltipText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  }
});
