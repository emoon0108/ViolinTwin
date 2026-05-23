import {
  AnalyticsSegment,
  BackendSyncPlan,
  ConflictRecord,
  ExportReport,
  LessonSlot,
  NotificationWorkflow,
  QrScanTarget,
  ReviewQueueItem,
  SessionAnalysis,
  StudioAnalytics,
  StudioOpsSnapshot,
  StudioSetting,
  StudioStudent,
  SyncRecord
} from "../types/violin";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function daysAgoLabel(index: number) {
  if (index === 0) {
    return "Today";
  }

  if (index === 1) {
    return "Yesterday";
  }

  return `${index + 1} days ago`;
}

function issueFromSession(session: SessionAnalysis | undefined, fallback: string) {
  return session?.topIssue?.title ?? session?.focus[0] ?? fallback;
}

function scoreFromSession(session: SessionAnalysis | undefined, fallback: number) {
  return session?.overallScore ?? fallback;
}

function buildStudents(history: SessionAnalysis[]): StudioStudent[] {
  const latest = history[0];
  const prior = history[1];
  const third = history[2];

  return [
    {
      id: "maya",
      name: "Maya Chen",
      instrument: "Violin",
      lastSessionLabel: latest ? daysAgoLabel(0) : "No session yet",
      latestScore: scoreFromSession(latest, 82),
      currentIssue: issueFromSession(latest, "Third finger lands sharp in A major"),
      nextAction: latest?.recommendedDrill ?? "Assign slow A major landing drill",
      status: latest && latest.overallScore < 74 ? "needs-review" : "on-track",
      streakDays: Math.max(2, Math.min(9, history.length + 2))
    },
    {
      id: "leo",
      name: "Leo Martin",
      instrument: "Violin",
      lastSessionLabel: prior ? daysAgoLabel(1) : "2 days ago",
      latestScore: scoreFromSession(prior, 68),
      currentIssue: issueFromSession(prior, "Rushing eighth-note subdivisions"),
      nextAction: "Review measure loop before lesson",
      status: scoreFromSession(prior, 68) < 72 ? "needs-review" : "on-track",
      streakDays: 3
    },
    {
      id: "amina",
      name: "Amina Patel",
      instrument: "Violin",
      lastSessionLabel: third ? daysAgoLabel(2) : "6 days ago",
      latestScore: scoreFromSession(third, 76),
      currentIssue: issueFromSession(third, "Bow pressure spikes on soft attacks"),
      nextAction: "Assign contact-point warmup",
      status: third ? "on-track" : "inactive",
      streakDays: third ? 5 : 0
    }
  ];
}

function buildReviewQueue(history: SessionAnalysis[]): ReviewQueueItem[] {
  const source = history.length > 0 ? history.slice(0, 3) : [];
  const generated: ReviewQueueItem[] = source.map((session, index) => {
    const status: ReviewQueueItem["status"] =
      index === 0 ? "Needs Review" : index === 1 ? "Assigned Drill" : "Completed";

    return {
      id: session.id,
      studentName: ["Maya Chen", "Leo Martin", "Amina Patel"][index] ?? "Studio Student",
      submittedLabel: daysAgoLabel(index),
      issue: issueFromSession(session, "Needs teacher review"),
      targetName: session.targetName ?? session.scaleTargetName ?? session.mode,
      status
    };
  });

  if (generated.length >= 3) {
    return generated;
  }

  const fallbackItems: ReviewQueueItem[] = [
    ...generated,
    {
      id: "queue-a",
      studentName: "Leo Martin",
      submittedLabel: "Today",
      issue: "Late arrivals after string crossings",
      targetName: "D Major Scale",
      status: "Needs Review"
    },
    {
      id: "queue-b",
      studentName: "Amina Patel",
      submittedLabel: "Yesterday",
      issue: "Tone thins during soft dynamics",
      targetName: "Etude Take",
      status: "Assigned Drill"
    }
  ];

  return fallbackItems.slice(0, 3);
}

function buildAnalytics(history: SessionAnalysis[], students: StudioStudent[]): StudioAnalytics {
  const scores = history.map((session) => session.overallScore);
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    : Math.round(students.reduce((sum, student) => sum + student.latestScore, 0) / students.length);
  const atRiskStudents = students.filter((student) => student.status !== "on-track").length;
  const topIssue = students.find((student) => student.status === "needs-review")?.currentIssue ?? students[0].currentIssue;
  const practiceMinutes = history.reduce((sum, session) => sum + session.durationMs / 60000, 0);

  return {
    activeStudents: students.filter((student) => student.status !== "inactive").length,
    weeklyRetention: clamp(88 - atRiskStudents * 9 + Math.min(history.length, 4) * 2, 54, 98),
    averageScore,
    atRiskStudents,
    topIssue,
    practiceMinutes: Math.max(42, Math.round(practiceMinutes || 74))
  };
}

function buildSyncRecords(history: SessionAnalysis[]): SyncRecord[] {
  const latest = history[0];

  return [
    {
      id: "recording",
      label: "Latest practice take",
      detail: latest?.targetName ?? "A Major Scale",
      status: latest ? "synced" : "pending",
      updatedLabel: latest ? "Just now" : "Waiting for capture"
    },
    {
      id: "booking",
      label: "Lesson booking",
      detail: "Saturday studio slot",
      status: "pending",
      updatedLabel: "Queued offline"
    },
    {
      id: "report",
      label: "Teacher report",
      detail: "Maya Chen intonation notes",
      status: history.length > 2 ? "conflict" : "synced",
      updatedLabel: history.length > 2 ? "Needs merge" : "2 min ago"
    }
  ];
}

function buildQrScanTargets(history: SessionAnalysis[]): QrScanTarget[] {
  const latest = history[0];

  return [
    {
      id: "report",
      label: "Latest Report",
      payload: `violintwin:report:${latest?.id ?? "demo"}`,
      destination: "Report",
      studentName: "Maya Chen",
      summary: latest
        ? `${latest.overallScore} score on ${latest.targetName ?? latest.mode}; ${latest.pitchLabel.toLowerCase()}`
        : "Demo intonation report with teacher notes and assignment history",
      primaryAction: "Open Report"
    },
    {
      id: "booking",
      label: "Book Lesson",
      payload: "violintwin:booking:sat-1000",
      destination: "Booking",
      studentName: "Open Slot",
      summary: "Saturday 10:00 AM lesson slot with intonation review focus",
      primaryAction: "Reserve Slot"
    },
    {
      id: "assignment",
      label: "Assignment",
      payload: "violintwin:assignment:a-major-loop",
      destination: "Assignment",
      studentName: "Maya Chen",
      summary: latest?.recommendedDrill ?? "Slow A major landing drill with three clean repetitions",
      primaryAction: "Start Drill"
    }
  ];
}

function buildConflictRecords(history: SessionAnalysis[]): ConflictRecord[] {
  const latest = history[0];

  return [
    {
      id: "teacher-note",
      title: "Teacher report note",
      localVersion: latest?.recommendedDrill ?? "Assign slow landing drill before the next lesson.",
      cloudVersion: "Teacher added: check left-hand frame before shifting.",
      impact: "The student report needs one final merged instruction before sharing."
    },
    {
      id: "lesson-slot",
      title: "Lesson booking",
      localVersion: "Maya selected Saturday 10:00 AM while offline.",
      cloudVersion: "The studio calendar still shows Saturday 10:00 AM as open.",
      impact: "Confirm the local reservation so the calendar does not double-book."
    }
  ];
}

function buildSettings(): StudioSetting[] {
  return [
    {
      id: "hours",
      label: "Studio Hours",
      value: "Tue-Sat, 9 AM-6 PM",
      detail: "Controls available booking slots and student self-serve scheduling."
    },
    {
      id: "duration",
      label: "Lesson Duration",
      value: "45 minutes",
      detail: "Default block length used when generating lesson availability."
    },
    {
      id: "policy",
      label: "Cancellation Policy",
      value: "12 hour notice",
      detail: "Late cancellations stay visible in the review queue for teacher approval."
    },
    {
      id: "availability",
      label: "Teacher Availability",
      value: "3 open slots",
      detail: "Openings can be handed off through QR booking links."
    },
    {
      id: "templates",
      label: "Assignment Templates",
      value: "8 saved",
      detail: "Reusable drills for intonation, rhythm, bow control, and review loops."
    }
  ];
}

function buildAnalyticsSegments(students: StudioStudent[], history: SessionAnalysis[]): AnalyticsSegment[] {
  const improvingFast = history.length >= 2 && history[0].overallScore > history[1].overallScore ? 1 : 2;

  return [
    {
      id: "at-risk",
      label: "At Risk",
      count: students.filter((student) => student.status !== "on-track").length,
      criteria: "Needs review, inactive, or below 72 score",
      action: "Send teacher check-in"
    },
    {
      id: "improving",
      label: "Improving Fastest",
      count: improvingFast,
      criteria: "Score improved across recent takes",
      action: "Share progress report"
    },
    {
      id: "inactive",
      label: "No Practice In 7 Days",
      count: students.filter((student) => student.status === "inactive").length,
      criteria: "No captured session this week",
      action: "Queue missed-practice nudge"
    },
    {
      id: "consistent",
      label: "High Consistency",
      count: students.filter((student) => student.latestScore >= 80).length,
      criteria: "80+ score and stable streak",
      action: "Assign stretch piece"
    },
    {
      id: "review",
      label: "Needs Teacher Review",
      count: students.filter((student) => student.status === "needs-review").length,
      criteria: "Latest issue should be triaged",
      action: "Open review queue"
    }
  ];
}

function buildNotifications(): NotificationWorkflow[] {
  return [
    {
      id: "lesson-reminder",
      label: "Lesson reminder",
      channel: "Push",
      trigger: "24 hours before booked slot",
      status: "Ready"
    },
    {
      id: "teacher-reviewed",
      label: "Teacher reviewed take",
      channel: "Email",
      trigger: "Review queue moves to Assigned Drill",
      status: "Queued"
    },
    {
      id: "missed-practice",
      label: "Missed-practice nudge",
      channel: "SMS",
      trigger: "No session for 7 days",
      status: "Paused"
    }
  ];
}

function buildExportReports(history: SessionAnalysis[]): ExportReport[] {
  return [
    {
      id: "lesson-summary",
      title: "Lesson Summary",
      format: "PDF",
      pages: 2,
      sections: ["Score trend", "Teacher note", "Assigned drill"],
      status: history.length ? "Ready" : "Generated"
    },
    {
      id: "practice-receipt",
      title: "Practice Receipt",
      format: "Print",
      pages: 1,
      sections: ["Session metrics", "QR report link"],
      status: "Generated"
    }
  ];
}

function buildBackendSync(students: StudioStudent[], history: SessionAnalysis[]): BackendSyncPlan {
  return {
    provider: "Supabase",
    endpointLabel: "REST sync adapter ready for SUPABASE_URL",
    payloadPreview: JSON.stringify({
      students: students.length,
      lessons: 3,
      reports: Math.max(1, history.length),
      queue_status: "Needs Review",
      sync_records: 3
    }),
    tables: [
      {
        tableName: "students",
        records: students.length,
        lastSyncLabel: "Local snapshot ready",
        status: "ready"
      },
      {
        tableName: "lessons",
        records: 3,
        lastSyncLabel: "Booking delta queued",
        status: "syncing"
      },
      {
        tableName: "reports",
        records: Math.max(1, history.length),
        lastSyncLabel: "Awaiting project URL",
        status: "needs-env"
      },
      {
        tableName: "review_queue",
        records: 3,
        lastSyncLabel: "Queue status mapped",
        status: "ready"
      },
      {
        tableName: "sync_records",
        records: 3,
        lastSyncLabel: "Conflict log mapped",
        status: "ready"
      }
    ]
  };
}

export function buildStudioOpsSnapshot(history: SessionAnalysis[]): StudioOpsSnapshot {
  const students = buildStudents(history);
  const reviewQueue = buildReviewQueue(history);
  const analytics = buildAnalytics(history, students);

  return {
    students,
    reviewQueue,
    analytics,
    syncRecords: buildSyncRecords(history),
    qrScanTargets: buildQrScanTargets(history),
    conflictRecords: buildConflictRecords(history),
    settings: buildSettings(),
    analyticsSegments: buildAnalyticsSegments(students, history),
    notifications: buildNotifications(),
    exportReports: buildExportReports(history),
    backendSync: buildBackendSync(students, history),
    qrShareUrl: "violintwin.app/studio/maya/latest",
    qrPayload: `violintwin:studio-report:${history[0]?.id ?? "demo"}`,
    lessonSlots: [
      {
        id: "slot-1",
        timeLabel: "Sat 10:00 AM",
        studentName: "Open",
        focus: "Intonation review",
        status: "open"
      },
      {
        id: "slot-2",
        timeLabel: "Sat 11:00 AM",
        studentName: "Maya Chen",
        focus: "A major shifting",
        status: "booked"
      },
      {
        id: "slot-3",
        timeLabel: "Sun 2:30 PM",
        studentName: "Leo Martin",
        focus: "Rhythm recovery",
        status: "waitlist"
      }
    ]
  };
}
