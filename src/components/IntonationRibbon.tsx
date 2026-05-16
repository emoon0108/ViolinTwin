import { scaleLinear } from "d3-scale";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { RibbonPoint } from "../lib/digitalTwinDashboard";
import { colors } from "../theme/colors";

type Props = {
  points: RibbonPoint[];
  width?: number;
  height?: number;
  title?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function IntonationRibbon({ points, width = 320, height = 220, title = "Intonation Ribbon" }: Props) {
  const chart = useMemo(() => {
    if (points.length === 0) {
      return null;
    }

    const padding = { top: 24, right: 18, bottom: 28, left: 18 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const xScale = scaleLinear().domain([0, Math.max(points.length - 1, 1)]).range([padding.left, padding.left + innerWidth]);
    const yScale = scaleLinear().domain([-35, 35]).range([padding.top + innerHeight, padding.top]);
    const colorScale = scaleLinear<string>()
      .domain([-35, -10, 0, 10, 35])
      .range(["#2D6CFF", "#58A6FF", colors.success, "#FF9A7A", "#FF4D62"])
      .clamp(true);

    const baseline = yScale(0);
    const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(index)} ${yScale(clamp(point.centsDeviation, -35, 35))}`)
      .join(" ");

    const dangerPoints = points.filter(
      (point) => Math.abs(point.centsDeviation) > 15 || Math.abs(point.timingDeltaMs) > 95
    );

    const measures = Array.from(new Set(points.map((point) => point.measureNumber))).slice(0, 12);

    return { padding, innerWidth, innerHeight, xScale, yScale, colorScale, baseline, path, dangerPoints, measures };
  }, [height, points, width]);

  if (!chart) {
    return (
      <View style={styles.shell}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Import or select a target to generate a note-by-note timeline footprint.</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Green stays centered when the take is in tune. Red and blue spikes expose panic moments by measure.</Text>

      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={24} fill="rgba(255,255,255,0.02)" />
        <Line x1={chart.padding.left} y1={chart.baseline} x2={width - chart.padding.right} y2={chart.baseline} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
        <Path d={chart.path} stroke={colors.success} strokeWidth={3} fill="none" />

        {points.map((point, index) => {
          const x = chart.xScale(index);
          const y = chart.yScale(clamp(point.centsDeviation, -35, 35));
          return <Circle key={`${point.label}-${index}`} cx={x} cy={y} r={3.8} fill={chart.colorScale(point.centsDeviation)} opacity={point.matched ? 0.95 : 0.72} />;
        })}

        {chart.dangerPoints.map((point, index) => {
          const x = chart.xScale(point.index);
          const y = chart.yScale(clamp(point.centsDeviation, -35, 35));
          return (
            <Circle
              key={`danger-${point.index}-${index}`}
              cx={x}
              cy={y}
              r={7}
              stroke={Math.abs(point.centsDeviation) > 15 ? colors.warning : colors.violet}
              strokeWidth={2}
              fill="transparent"
              opacity={0.85}
            />
          );
        })}

        {chart.measures.map((measure, index) => {
          const firstPointIndex = points.findIndex((point) => point.measureNumber === measure);
          if (firstPointIndex < 0) {
            return null;
          }
          const x = chart.xScale(firstPointIndex);
          return (
            <SvgText key={`measure-${measure}-${index}`} x={x} y={height - 8} fill={colors.textMuted} fontSize="10" textAnchor="middle">
              m.{measure}
            </SvgText>
          );
        })}
      </Svg>

      <View style={styles.legendRow}>
        <Text style={styles.legendText}>Blue = flat</Text>
        <Text style={styles.legendText}>Green = centered</Text>
        <Text style={styles.legendText}>Red = sharp</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: colors.border
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 20,
    fontSize: 13
  },
  legendRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap"
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 12
  }
});
