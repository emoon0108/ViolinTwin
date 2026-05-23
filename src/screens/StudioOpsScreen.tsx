import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { BottomNav } from "../components/BottomNav";
import { GlassCard } from "../components/GlassCard";
import { NeonButton } from "../components/NeonButton";
import { ScreenBackground } from "../components/ScreenBackground";
import { usePractice } from "../context/PracticeContext";
import { buildStudioOpsSnapshot } from "../lib/studioOps";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { LessonSlot, ReviewQueueStatus, StudioStudentStatus, SyncStatus } from "../types/violin";

type Props = NativeStackScreenProps<RootStackParamList, "StudioOps">;

const queueStatuses: ReviewQueueStatus[] = ["Needs Review", "Assigned Drill", "Completed"];
const syncStatuses: SyncStatus[] = ["synced", "pending", "conflict"];

function statusLabel(status: StudioStudentStatus) {
  if (status === "on-track") {
    return "On Track";
  }

  if (status === "needs-review") {
    return "Needs Review";
  }

  return "Inactive";
}

function statusColor(status: StudioStudentStatus | LessonSlot["status"] | ReviewQueueStatus | SyncStatus) {
  if (status === "on-track" || status === "booked" || status === "Completed" || status === "synced") {
    return colors.success;
  }

  if (status === "needs-review" || status === "waitlist" || status === "Needs Review" || status === "conflict") {
    return colors.warning;
  }

  return colors.cyan;
}

function QRCodePreview({ payload }: { payload: string }) {
  const cells = Array.from({ length: 49 }, (_, index) => {
    const charCode = payload.charCodeAt(index % payload.length);
    return (charCode + index * 7 + Math.floor(index / 7) * 3) % 4 !== 0;
  });

  return (
    <Svg width={132} height={132} viewBox="0 0 148 148">
      <Rect x={0} y={0} width={148} height={148} rx={14} fill="#F3F7FF" />
      {[0, 5, 35].map((offset, index) => {
        const x = index === 1 ? 100 : 12;
        const y = index === 2 ? 100 : 12 + offset;
        return (
          <React.Fragment key={`${x}-${y}`}>
            <Rect x={x} y={y} width={34} height={34} rx={4} fill={colors.background} />
            <Rect x={x + 8} y={y + 8} width={18} height={18} rx={2} fill="#F3F7FF" />
            <Rect x={x + 13} y={y + 13} width={8} height={8} rx={1} fill={colors.background} />
          </React.Fragment>
        );
      })}
      {cells.map((filled, index) =>
        filled ? (
          <Rect
            key={index}
            x={54 + (index % 7) * 10}
            y={54 + Math.floor(index / 7) * 10}
            width={7}
            height={7}
            rx={1}
            fill={colors.background}
          />
        ) : null
      )}
    </Svg>
  );
}

export function StudioOpsScreen({ navigation }: Props) {
  const { history } = usePractice();
  const snapshot = useMemo(() => buildStudioOpsSnapshot(history), [history]);
  const [bookedSlots, setBookedSlots] = useState<Record<string, boolean>>({});
  const [queueOverrides, setQueueOverrides] = useState<Record<string, ReviewQueueStatus>>({});
  const [syncOverrides, setSyncOverrides] = useState<Record<string, SyncStatus>>({});

  const selectedSlotCount = Object.values(bookedSlots).filter(Boolean).length;

  return (
    <ScreenBackground>
      <Text style={styles.eyebrow}>STUDIO OPERATIONS</Text>
      <Text style={styles.heading}>Studio Ops</Text>
      <Text style={styles.subheading}>
        A teacher-facing layer for scheduling, QR reports, review queues, analytics, and offline sync.
      </Text>

      <GlassCard style={styles.heroCard}>
        <View style={styles.heroMetrics}>
          <View>
            <Text style={styles.metricLabel}>Active Students</Text>
            <Text style={styles.metricValue}>{snapshot.analytics.activeStudents}</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Retention</Text>
            <Text style={styles.metricValue}>{snapshot.analytics.weeklyRetention}%</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>At Risk</Text>
            <Text style={styles.metricValue}>{snapshot.analytics.atRiskStudents}</Text>
          </View>
        </View>
        <Text style={styles.heroNote}>Top studio issue: {snapshot.analytics.topIssue}</Text>
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Teacher Dashboard</Text>
        {snapshot.students.map((student) => (
          <View key={student.id} style={styles.studentRow}>
            <View style={styles.studentMain}>
              <Text style={styles.studentName}>{student.name}</Text>
              <Text style={styles.studentMeta}>
                {student.instrument} · {student.lastSessionLabel} · {student.streakDays} day streak
              </Text>
              <Text style={styles.issueText}>{student.currentIssue}</Text>
            </View>
            <View style={styles.studentSide}>
              <Text style={styles.scoreText}>{student.latestScore}</Text>
              <Text style={[styles.statusText, { color: statusColor(student.status) }]}>{statusLabel(student.status)}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.qrRow}>
          <QRCodePreview payload={snapshot.qrPayload} />
          <View style={styles.qrCopy}>
            <Text style={styles.sectionTitle}>QR Report Share</Text>
            <Text style={styles.bodyText}>Student report, latest take, and next assignment are bundled behind one scan link.</Text>
            <Text style={styles.linkText}>{snapshot.qrShareUrl}</Text>
          </View>
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Lesson Scheduling</Text>
        {snapshot.lessonSlots.map((slot) => {
          const locallyBooked = bookedSlots[slot.id];
          const status = locallyBooked ? "booked" : slot.status;
          return (
            <Pressable
              key={slot.id}
              style={[styles.slotRow, locallyBooked && styles.selectedRow]}
              onPress={() => setBookedSlots((current) => ({ ...current, [slot.id]: !current[slot.id] }))}
            >
              <View>
                <Text style={styles.slotTime}>{slot.timeLabel}</Text>
                <Text style={styles.bodyText}>{locallyBooked && slot.status === "open" ? "Maya Chen" : slot.studentName}</Text>
              </View>
              <View style={styles.slotSide}>
                <Text style={styles.issueText}>{slot.focus}</Text>
                <Text style={[styles.statusText, { color: statusColor(status) }]}>{status.toUpperCase()}</Text>
              </View>
            </Pressable>
          );
        })}
        <Text style={styles.smallNote}>{selectedSlotCount} local booking change queued for sync.</Text>
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Review Queue</Text>
        {snapshot.reviewQueue.map((item) => {
          const status = queueOverrides[item.id] ?? item.status;
          return (
            <View key={item.id} style={styles.queueRow}>
              <View style={styles.studentMain}>
                <Text style={styles.studentName}>{item.studentName}</Text>
                <Text style={styles.studentMeta}>
                  {item.targetName} · {item.submittedLabel}
                </Text>
                <Text style={styles.issueText}>{item.issue}</Text>
              </View>
              <Pressable
                style={styles.stateButton}
                onPress={() =>
                  setQueueOverrides((current) => {
                    const currentIndex = queueStatuses.indexOf(status);
                    return { ...current, [item.id]: queueStatuses[(currentIndex + 1) % queueStatuses.length] };
                  })
                }
              >
                <Text style={[styles.stateButtonText, { color: statusColor(status) }]}>{status}</Text>
              </Pressable>
            </View>
          );
        })}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Business Analytics</Text>
        <View style={styles.analyticsGrid}>
          <View style={styles.analyticsTile}>
            <Text style={styles.metricLabel}>Avg Score</Text>
            <Text style={styles.metricValue}>{snapshot.analytics.averageScore}</Text>
          </View>
          <View style={styles.analyticsTile}>
            <Text style={styles.metricLabel}>Practice Min</Text>
            <Text style={styles.metricValue}>{snapshot.analytics.practiceMinutes}</Text>
          </View>
        </View>
        <Text style={styles.bodyText}>Use trend data to prioritize which students need review before the next lesson block.</Text>
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Offline Sync Simulation</Text>
        {snapshot.syncRecords.map((record) => {
          const status = syncOverrides[record.id] ?? record.status;
          return (
            <Pressable
              key={record.id}
              style={styles.syncRow}
              onPress={() =>
                setSyncOverrides((current) => {
                  const currentIndex = syncStatuses.indexOf(status);
                  return { ...current, [record.id]: syncStatuses[(currentIndex + 1) % syncStatuses.length] };
                })
              }
            >
              <View style={[styles.syncDot, { backgroundColor: statusColor(status) }]} />
              <View style={styles.studentMain}>
                <Text style={styles.studentName}>{record.label}</Text>
                <Text style={styles.studentMeta}>
                  {record.detail} · {record.updatedLabel}
                </Text>
              </View>
              <Text style={[styles.statusText, { color: statusColor(status) }]}>{status.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </GlassCard>

      <NeonButton label="Open Practice Capture" variant="secondary" onPress={() => navigation.navigate("Practice")} />
      <BottomNav active="StudioOps" onNavigate={(key) => navigation.navigate(key)} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.cyan,
    letterSpacing: 2,
    fontSize: 11,
    marginBottom: 10
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: "800"
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 18
  },
  heroCard: {
    marginBottom: 16
  },
  heroMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600"
  },
  metricValue: {
    color: colors.cyan,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 6
  },
  heroNote: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16
  },
  card: {
    marginBottom: 16
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12
  },
  studentRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  studentMain: {
    flex: 1
  },
  studentName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700"
  },
  studentMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3
  },
  issueText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6
  },
  studentSide: {
    width: 74,
    alignItems: "flex-end"
  },
  scoreText: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800"
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5
  },
  qrRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center"
  },
  qrCopy: {
    flex: 1
  },
  bodyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  linkText: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10
  },
  slotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  selectedRow: {
    backgroundColor: "rgba(79,213,255,0.08)",
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 12
  },
  slotTime: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800"
  },
  slotSide: {
    flex: 1,
    alignItems: "flex-end"
  },
  smallNote: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 12
  },
  queueRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  stateButton: {
    minWidth: 104,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center"
  },
  stateButtonText: {
    fontSize: 11,
    fontWeight: "800"
  },
  analyticsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12
  },
  analyticsTile: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  }
});
