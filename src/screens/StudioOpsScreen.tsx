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
import {
  ConflictRecord,
  LessonSlot,
  QrScanTarget,
  ReviewQueueStatus,
  StudioRole,
  StudioStudentStatus,
  SyncStatus
} from "../types/violin";

type Props = NativeStackScreenProps<RootStackParamList, "StudioOps">;

const queueStatuses: ReviewQueueStatus[] = ["Needs Review", "Assigned Drill", "Completed"];
const syncStatuses: SyncStatus[] = ["synced", "pending", "conflict"];
const roles: StudioRole[] = ["Teacher", "Student", "Parent"];

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

function RoleSummary({ role, snapshot }: { role: StudioRole; snapshot: ReturnType<typeof buildStudioOpsSnapshot> }) {
  if (role === "Student") {
    const student = snapshot.students[0];
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Student View</Text>
        <Text style={styles.studentName}>{student.name}</Text>
        <Text style={styles.bodyText}>Next assignment: {student.nextAction}</Text>
        <View style={styles.progressRail}>
          <View style={[styles.progressFill, { width: `${Math.max(12, student.latestScore)}%` }]} />
        </View>
        <Text style={styles.smallNote}>Latest score {student.latestScore}; current focus is {student.currentIssue.toLowerCase()}.</Text>
      </GlassCard>
    );
  }

  if (role === "Parent") {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Parent View</Text>
        <View style={styles.parentGrid}>
          <View style={styles.analyticsTile}>
            <Text style={styles.metricLabel}>Next Lesson</Text>
            <Text style={styles.parentValue}>Sat 11:00</Text>
          </View>
          <View style={styles.analyticsTile}>
            <Text style={styles.metricLabel}>Practice Streak</Text>
            <Text style={styles.parentValue}>{snapshot.students[0].streakDays} days</Text>
          </View>
        </View>
        <Text style={styles.bodyText}>Progress summary, upcoming schedule, and teacher-approved assignments are separated from teacher triage tools.</Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card}>
      <Text style={styles.sectionTitle}>Teacher View</Text>
      <Text style={styles.bodyText}>Full studio controls are enabled: student triage, queue status, booking changes, analytics, QR handoff, and sync repair.</Text>
    </GlassCard>
  );
}

function ScannedTargetCard({ target }: { target: QrScanTarget | null }) {
  if (!target) {
    return (
      <View style={styles.scanEmpty}>
        <Text style={styles.scanEmptyText}>No scan selected</Text>
      </View>
    );
  }

  return (
    <View style={styles.scannedCard}>
      <Text style={styles.studentName}>{target.destination}</Text>
      <Text style={styles.studentMeta}>{target.studentName}</Text>
      <Text style={styles.issueText}>{target.summary}</Text>
      <Text style={styles.linkText}>{target.primaryAction}</Text>
    </View>
  );
}

function ConflictResolver({
  conflict,
  resolution,
  onResolve
}: {
  conflict: ConflictRecord;
  resolution: string | null;
  onResolve: (resolution: string) => void;
}) {
  return (
    <View style={[styles.conflictCard, resolution && styles.resolvedConflict]}>
      <View style={styles.conflictHeader}>
        <Text style={styles.studentName}>{conflict.title}</Text>
        <Text style={[styles.statusText, { color: resolution ? colors.success : colors.warning }]}>
          {resolution ?? "UNRESOLVED"}
        </Text>
      </View>
      <Text style={styles.bodyText}>{conflict.impact}</Text>
      <View style={styles.versionGrid}>
        <View style={styles.versionTile}>
          <Text style={styles.metricLabel}>Local</Text>
          <Text style={styles.versionText}>{conflict.localVersion}</Text>
        </View>
        <View style={styles.versionTile}>
          <Text style={styles.metricLabel}>Cloud</Text>
          <Text style={styles.versionText}>{conflict.cloudVersion}</Text>
        </View>
      </View>
      <View style={styles.conflictActions}>
        <Pressable style={styles.mergeButton} onPress={() => onResolve("LOCAL")}>
          <Text style={styles.mergeButtonText}>Keep Local</Text>
        </Pressable>
        <Pressable style={styles.mergeButton} onPress={() => onResolve("CLOUD")}>
          <Text style={styles.mergeButtonText}>Use Cloud</Text>
        </Pressable>
        <Pressable style={styles.mergeButton} onPress={() => onResolve("MERGED")}>
          <Text style={styles.mergeButtonText}>Merge</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function StudioOpsScreen({ navigation }: Props) {
  const { history } = usePractice();
  const snapshot = useMemo(() => buildStudioOpsSnapshot(history), [history]);
  const [selectedRole, setSelectedRole] = useState<StudioRole>("Teacher");
  const [selectedScanId, setSelectedScanId] = useState(snapshot.qrScanTargets[0]?.id ?? "report");
  const [bookedSlots, setBookedSlots] = useState<Record<string, boolean>>({});
  const [queueOverrides, setQueueOverrides] = useState<Record<string, ReviewQueueStatus>>({});
  const [syncOverrides, setSyncOverrides] = useState<Record<string, SyncStatus>>({});
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, string>>({});

  const selectedSlotCount = Object.values(bookedSlots).filter(Boolean).length;
  const selectedScan = snapshot.qrScanTargets.find((target) => target.id === selectedScanId) ?? null;

  return (
    <ScreenBackground>
      <Text style={styles.eyebrow}>STUDIO OPERATIONS</Text>
      <Text style={styles.heading}>Studio Ops</Text>
      <Text style={styles.subheading}>
        Role-based workflows for scheduling, QR entry, review queues, analytics, and offline sync repair.
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
        <Text style={styles.sectionTitle}>Role-Based Views</Text>
        <View style={styles.roleTabs}>
          {roles.map((role) => (
            <Pressable
              key={role}
              style={[styles.roleTab, selectedRole === role && styles.roleTabActive]}
              onPress={() => setSelectedRole(role)}
            >
              <Text style={[styles.roleTabText, selectedRole === role && styles.roleTabTextActive]}>{role}</Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      <RoleSummary role={selectedRole} snapshot={snapshot} />

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
        <Text style={styles.sectionTitle}>QR Scan Entry</Text>
        <View style={styles.scanButtonRow}>
          {snapshot.qrScanTargets.map((target) => (
            <Pressable
              key={target.id}
              style={[styles.scanButton, selectedScanId === target.id && styles.scanButtonActive]}
              onPress={() => setSelectedScanId(target.id)}
            >
              <Text style={[styles.scanButtonText, selectedScanId === target.id && styles.scanButtonTextActive]}>
                {target.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScannedTargetCard target={selectedScan} />
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
        <Text style={styles.sectionTitle}>Admin Settings</Text>
        {snapshot.settings.map((setting) => (
          <View key={setting.id} style={styles.settingRow}>
            <View style={styles.studentMain}>
              <Text style={styles.studentName}>{setting.label}</Text>
              <Text style={styles.studentMeta}>{setting.detail}</Text>
            </View>
            <Text style={styles.settingValue}>{setting.value}</Text>
          </View>
        ))}
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
        <Text style={styles.sectionTitle}>Analytics Segments</Text>
        <View style={styles.segmentGrid}>
          {snapshot.analyticsSegments.map((segment) => (
            <View key={segment.id} style={styles.segmentTile}>
              <View style={styles.segmentTop}>
                <Text style={styles.segmentCount}>{segment.count}</Text>
                <Text style={styles.segmentLabel}>{segment.label}</Text>
              </View>
              <Text style={styles.studentMeta}>{segment.criteria}</Text>
              <Text style={styles.linkText}>{segment.action}</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Notification Workflow</Text>
        {snapshot.notifications.map((notification) => (
          <View key={notification.id} style={styles.notificationRow}>
            <View style={styles.channelBadge}>
              <Text style={styles.channelText}>{notification.channel}</Text>
            </View>
            <View style={styles.studentMain}>
              <Text style={styles.studentName}>{notification.label}</Text>
              <Text style={styles.studentMeta}>{notification.trigger}</Text>
            </View>
            <Text style={[styles.statusText, { color: notification.status === "Paused" ? colors.warning : colors.success }]}>
              {notification.status.toUpperCase()}
            </Text>
          </View>
        ))}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Print & Export</Text>
        {snapshot.exportReports.map((report) => (
          <View key={report.id} style={styles.exportRow}>
            <View style={styles.studentMain}>
              <Text style={styles.studentName}>{report.title}</Text>
              <Text style={styles.studentMeta}>
                {report.format} · {report.pages} {report.pages === 1 ? "page" : "pages"} · {report.sections.join(", ")}
              </Text>
            </View>
            <View style={styles.printBadge}>
              <Text style={styles.printBadgeText}>{report.status}</Text>
            </View>
          </View>
        ))}
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

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Conflict Resolution</Text>
        {snapshot.conflictRecords.map((conflict) => (
          <ConflictResolver
            key={conflict.id}
            conflict={conflict}
            resolution={conflictResolutions[conflict.id] ?? null}
            onResolve={(resolution) =>
              setConflictResolutions((current) => ({
                ...current,
                [conflict.id]: resolution
              }))
            }
          />
        ))}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Backend Sync</Text>
        <Text style={styles.bodyText}>{snapshot.backendSync.provider} · {snapshot.backendSync.endpointLabel}</Text>
        {snapshot.backendSync.tables.map((table) => (
          <View key={table.tableName} style={styles.backendRow}>
            <View style={styles.studentMain}>
              <Text style={styles.studentName}>{table.tableName}</Text>
              <Text style={styles.studentMeta}>
                {table.records} records · {table.lastSyncLabel}
              </Text>
            </View>
            <Text style={[styles.statusText, { color: table.status === "needs-env" ? colors.warning : colors.success }]}>
              {table.status.toUpperCase()}
            </Text>
          </View>
        ))}
        <View style={styles.payloadBox}>
          <Text style={styles.payloadText}>{snapshot.backendSync.payloadPreview}</Text>
        </View>
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
  roleTabs: {
    flexDirection: "row",
    gap: 10
  },
  roleTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border
  },
  roleTabActive: {
    backgroundColor: "rgba(79,213,255,0.16)",
    borderColor: colors.cyan
  },
  roleTabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800"
  },
  roleTabTextActive: {
    color: colors.textPrimary
  },
  progressRail: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 14,
    overflow: "hidden"
  },
  progressFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.success
  },
  parentGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12
  },
  parentValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6
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
  scanButtonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  scanButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border
  },
  scanButtonActive: {
    backgroundColor: "rgba(138,108,255,0.18)",
    borderColor: colors.violet
  },
  scanButtonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "800"
  },
  scanButtonTextActive: {
    color: colors.textPrimary
  },
  scanEmpty: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)"
  },
  scanEmptyText: {
    color: colors.textMuted,
    fontSize: 13
  },
  scannedCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(79,213,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(79,213,255,0.22)"
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
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  settingValue: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: "800",
    maxWidth: 112,
    textAlign: "right"
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
  segmentGrid: {
    gap: 10
  },
  segmentTile: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border
  },
  segmentTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  segmentCount: {
    color: colors.cyan,
    fontSize: 24,
    fontWeight: "800"
  },
  segmentLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "800"
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  channelBadge: {
    minWidth: 46,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(138,108,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(138,108,255,0.32)"
  },
  channelText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: "900"
  },
  exportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  printBadge: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "rgba(79,213,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(79,213,255,0.26)"
  },
  printBadgeText: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: "900"
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
  },
  conflictCard: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  resolvedConflict: {
    opacity: 0.86
  },
  conflictHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 8
  },
  versionGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  versionTile: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border
  },
  versionText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },
  conflictActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  mergeButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border
  },
  mergeButtonText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "800"
  },
  backendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  payloadBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: colors.border
  },
  payloadText: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16
  }
});
