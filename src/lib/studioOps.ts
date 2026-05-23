import {
  LessonSlot,
  ReviewQueueItem,
  SessionAnalysis,
  StudioAnalytics,
  StudioOpsSnapshot,
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

export function buildStudioOpsSnapshot(history: SessionAnalysis[]): StudioOpsSnapshot {
  const students = buildStudents(history);
  const reviewQueue = buildReviewQueue(history);
  const analytics = buildAnalytics(history, students);

  return {
    students,
    reviewQueue,
    analytics,
    syncRecords: buildSyncRecords(history),
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
