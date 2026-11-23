import { supabaseAdmin } from "./supabase";
import { percentToLetterGrade } from "./gradingEngine";
import { mapExtension, type Extension, effectiveDueDate, minutesLate } from "./lateWork";

/**
 * Batch student metrics for progress reports and the at-risk view.
 *
 * Grades follow gradingEngine.computeCourseGrade exactly (graded assignment
 * points + most recent submitted attempt per quiz, blended with attendance
 * when the course sets attendance_weight_percent), but computed for many
 * students at once with a fixed number of paginated queries instead of
 * 4+ queries per student per course.
 *
 * Due dates are each student's effective due date (extensions honoured).
 * Lateness is measured from submitted_at, so it works whether or not
 * late-work-and-alerts.sql has been applied.
 */

export interface RiskThresholds {
  minGradePercent: number;
  minAttendancePercent: number;
  maxMissingOrLate: number;
  inactiveDays: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  minGradePercent: 70,
  minAttendancePercent: 80,
  maxMissingOrLate: 2,
  inactiveDays: 14,
};

/** Window for the "missing or late work" rule. */
export const RECENT_WORK_WINDOW_DAYS = 14;

export async function getRiskThresholds(schoolId: string | null | undefined): Promise<RiskThresholds & { stored: boolean }> {
  if (!schoolId) return { ...DEFAULT_RISK_THRESHOLDS, stored: false };
  const { data, error } = await supabaseAdmin.from("school_risk_settings").select("*").eq("school_id", schoolId).maybeSingle();
  if (error || !data) return { ...DEFAULT_RISK_THRESHOLDS, stored: false };
  return {
    minGradePercent: Number(data.min_grade_percent ?? DEFAULT_RISK_THRESHOLDS.minGradePercent),
    minAttendancePercent: Number(data.min_attendance_percent ?? DEFAULT_RISK_THRESHOLDS.minAttendancePercent),
    maxMissingOrLate: Number(data.max_missing_or_late ?? DEFAULT_RISK_THRESHOLDS.maxMissingOrLate),
    inactiveDays: Number(data.inactive_days ?? DEFAULT_RISK_THRESHOLDS.inactiveDays),
    stored: true,
  };
}

export interface WorkItem {
  assignmentId: string;
  title: string;
  courseId: string;
  courseTitle: string | null;
  dueDate: string | null;
  extended: boolean;
  submittedAt: string | null;
  minutesLate: number;
  latePenaltyPercent: number;
}

export interface CourseMetrics {
  courseId: string;
  courseTitle: string;
  teacherId: string | null;
  gradePercent: number | null;
  letterGrade: string | null;
  attendancePercent: number | null;
  attendance: { present: number; absent: number; late: number; total: number };
  assignmentsPublished: number;
  assignmentsSubmitted: number;
  missingCount: number;
  lateCount: number;
  quizzesTaken: number;
  // COURSE COMPLETION: course modules/lessons (getCourseProgress) are being
  // built separately. Once lib/getCourseProgress exists, fill this with its
  // completion % per (course, student); the UI already renders it when set.
  completionPercent: number | null;
}

export interface StudentMetrics {
  studentId: string;
  courses: CourseMetrics[];
  averageGrade: number | null;
  attendance: { present: number; absent: number; late: number; total: number; percent: number | null };
  missing: WorkItem[];
  late: WorkItem[];
  recentMissingCount: number;
  recentLateCount: number;
  lastLoginAt: string | null;
}

const PAGE = 1000;
const ID_CHUNK = 150;

/** Pages through a PostgREST query (default max 1000 rows per response). */
async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** fetchAll over chunks of an id list (keeps URLs short). */
async function fetchAllIn<T>(ids: string[], make: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const part = unique.slice(i, i + ID_CHUNK);
    out.push(...(await fetchAll<T>((from, to) => make(part, from, to))));
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type Row = Record<string, any>;

export async function computeStudentMetrics(opts: {
  courseIds: string[];
  /** Restrict to these students (default: everyone actively enrolled). */
  studentIds?: string[];
  loginLookbackDays?: number;
  now?: Date;
}): Promise<Map<string, StudentMetrics>> {
  const now = opts.now ?? new Date();
  const result = new Map<string, StudentMetrics>();
  if (opts.courseIds.length === 0) return result;

  let enrollments = await fetchAllIn<Row>(opts.courseIds, (part, from, to) =>
    supabaseAdmin.from("course_enrollments").select("course_id, student_id").in("course_id", part).eq("status", "active").range(from, to)
  );
  if (opts.studentIds) {
    const allow = new Set(opts.studentIds);
    enrollments = enrollments.filter((e) => allow.has(e.student_id));
  }
  const studentIds = Array.from(new Set(enrollments.map((e) => e.student_id as string)));
  if (studentIds.length === 0) return result;
  const courseIds = Array.from(new Set(enrollments.map((e) => e.course_id as string)));

  const lookbackDays = opts.loginLookbackDays ?? 90;
  const loginSince = new Date(now.getTime() - lookbackDays * 86400000).toISOString();

  const [courses, assignments, quizzes, attendance, logins] = await Promise.all([
    fetchAllIn<Row>(courseIds, (part, from, to) =>
      supabaseAdmin.from("courses").select("id, title, teacher_id, attendance_weight_percent").in("id", part).range(from, to)
    ),
    fetchAllIn<Row>(courseIds, (part, from, to) =>
      supabaseAdmin.from("assignments").select("*").in("course_id", part).eq("is_published", true).range(from, to)
    ),
    fetchAllIn<Row>(courseIds, (part, from, to) =>
      supabaseAdmin.from("quizzes").select("id, course_id").in("course_id", part).range(from, to)
    ),
    fetchAllIn<Row>(courseIds, (part, from, to) =>
      supabaseAdmin.from("attendance").select("course_id, student_id, status").in("course_id", part).range(from, to)
    ),
    fetchAllIn<Row>(studentIds, (part, from, to) =>
      supabaseAdmin
        .from("platform_audit_log")
        .select("performed_by, created_at")
        .eq("action", "login")
        .in("performed_by", part)
        .gte("created_at", loginSince)
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
  ]);

  const assignmentIds = assignments.map((a) => a.id as string);
  const quizIds = quizzes.map((q) => q.id as string);
  const studentSet = new Set(studentIds);

  const [submissions, extensionRows, attempts] = await Promise.all([
    fetchAllIn<Row>(assignmentIds, (part, from, to) =>
      supabaseAdmin.from("submissions").select("*").in("assignment_id", part).range(from, to)
    ),
    fetchAllIn<Row>(assignmentIds, (part, from, to) =>
      supabaseAdmin.from("assignment_extensions").select("*").in("assignment_id", part).range(from, to)
    ),
    fetchAllIn<Row>(quizIds, (part, from, to) =>
      supabaseAdmin
        .from("quiz_attempts")
        .select("quiz_id, student_id, earned_points, total_points, submitted_at")
        .in("quiz_id", part)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .range(from, to)
    ),
  ]);

  const courseById = new Map(courses.map((c) => [c.id as string, c]));
  const subByKey = new Map<string, Row>();
  for (const s of submissions) if (studentSet.has(s.student_id)) subByKey.set(`${s.assignment_id}:${s.student_id}`, s);
  const extByKey = new Map<string, Extension>();
  for (const r of extensionRows) extByKey.set(`${r.assignment_id}:${r.student_id}`, mapExtension(r));
  const quizCourse = new Map(quizzes.map((q) => [q.id as string, q.course_id as string]));
  const lastLogin = new Map<string, string>();
  for (const l of logins) if (!lastLogin.has(l.performed_by)) lastLogin.set(l.performed_by, l.created_at);

  const assignmentsByCourse = new Map<string, Row[]>();
  for (const a of assignments) {
    const list = assignmentsByCourse.get(a.course_id) ?? [];
    list.push(a);
    assignmentsByCourse.set(a.course_id, list);
  }
  // Most recent submitted attempt per (quiz, student) — attempts are desc.
  const latestAttempt = new Map<string, Row>();
  for (const at of attempts) {
    const key = `${at.quiz_id}:${at.student_id}`;
    if (!latestAttempt.has(key)) latestAttempt.set(key, at);
  }
  const attendanceByKey = new Map<string, { present: number; absent: number; late: number; total: number }>();
  for (const r of attendance) {
    const key = `${r.course_id}:${r.student_id}`;
    const agg = attendanceByKey.get(key) ?? { present: 0, absent: 0, late: 0, total: 0 };
    if (r.status === "present") agg.present += 1;
    else if (r.status === "absent") agg.absent += 1;
    else if (r.status === "late") agg.late += 1;
    agg.total += 1;
    attendanceByKey.set(key, agg);
  }

  const windowStart = now.getTime() - RECENT_WORK_WINDOW_DAYS * 86400000;
  const inWindow = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= windowStart && new Date(iso).getTime() <= now.getTime();

  for (const studentId of studentIds) {
    const metrics: StudentMetrics = {
      studentId,
      courses: [],
      averageGrade: null,
      attendance: { present: 0, absent: 0, late: 0, total: 0, percent: null },
      missing: [],
      late: [],
      recentMissingCount: 0,
      recentLateCount: 0,
      lastLoginAt: lastLogin.get(studentId) ?? null,
    };
    result.set(studentId, metrics);
  }

  for (const e of enrollments) {
    const studentId = e.student_id as string;
    const courseId = e.course_id as string;
    const metrics = result.get(studentId)!;
    const course = courseById.get(courseId);
    const courseTitle = (course?.title as string) ?? "Course";

    let aEarned = 0;
    let aPossible = 0;
    let submittedCount = 0;
    let missingCount = 0;
    let lateCount = 0;
    const courseAssignments = assignmentsByCourse.get(courseId) ?? [];
    for (const a of courseAssignments) {
      const key = `${a.id}:${studentId}`;
      const sub = subByKey.get(key);
      const ext = extByKey.get(key) ?? null;
      const due = effectiveDueDate(a.due_date as string | null, ext);
      const handedIn = !!sub && (sub.status === "submitted" || sub.status === "graded");
      const item: WorkItem = {
        assignmentId: a.id,
        title: a.title,
        courseId,
        courseTitle,
        dueDate: due,
        extended: !!ext,
        submittedAt: (sub?.submitted_at as string | null) ?? null,
        minutesLate: 0,
        latePenaltyPercent: Number(sub?.late_penalty_percent ?? 0) || 0,
      };
      if (handedIn) {
        submittedCount += 1;
        const mins = minutesLate(sub!.submitted_at as string | null, due);
        if (mins > 0) {
          lateCount += 1;
          metrics.late.push({ ...item, minutesLate: mins });
          if (inWindow(due) || inWindow(sub!.submitted_at as string | null)) metrics.recentLateCount += 1;
        }
      } else if (due && new Date(due).getTime() < now.getTime()) {
        missingCount += 1;
        metrics.missing.push(item);
        if (inWindow(due)) metrics.recentMissingCount += 1;
      }

      const possible = Number(a.points_possible ?? 0);
      if (possible > 0 && sub && sub.grade !== null && sub.grade !== undefined) {
        aEarned += Number(sub.grade);
        aPossible += possible;
      }
    }

    let qEarned = 0;
    let qPossible = 0;
    let quizzesTaken = 0;
    for (const [quizId, qCourse] of quizCourse) {
      if (qCourse !== courseId) continue;
      const at = latestAttempt.get(`${quizId}:${studentId}`);
      if (!at) continue;
      quizzesTaken += 1;
      const total = Number(at.total_points ?? 0);
      if (total <= 0) continue;
      qEarned += Number(at.earned_points ?? 0);
      qPossible += total;
    }

    const att = attendanceByKey.get(`${courseId}:${studentId}`) ?? { present: 0, absent: 0, late: 0, total: 0 };
    const attendancePercent = att.total > 0 ? ((att.present + att.late) / att.total) * 100 : null;
    const academic = aPossible + qPossible > 0 ? ((aEarned + qEarned) / (aPossible + qPossible)) * 100 : null;
    const weight = Number(course?.attendance_weight_percent ?? 0);
    const overall =
      weight > 0 && attendancePercent !== null && academic !== null
        ? academic * (1 - weight / 100) + attendancePercent * (weight / 100)
        : academic;

    metrics.courses.push({
      courseId,
      courseTitle,
      teacherId: (course?.teacher_id as string | null) ?? null,
      gradePercent: overall !== null ? round1(overall) : null,
      letterGrade: percentToLetterGrade(overall),
      attendancePercent: attendancePercent !== null ? round1(attendancePercent) : null,
      attendance: att,
      assignmentsPublished: courseAssignments.length,
      assignmentsSubmitted: submittedCount,
      missingCount,
      lateCount,
      quizzesTaken,
      completionPercent: null,
    });
    metrics.attendance.present += att.present;
    metrics.attendance.absent += att.absent;
    metrics.attendance.late += att.late;
    metrics.attendance.total += att.total;
  }

  for (const m of result.values()) {
    const graded = m.courses.map((c) => c.gradePercent).filter((g): g is number => g !== null);
    m.averageGrade = graded.length > 0 ? round1(graded.reduce((s, g) => s + g, 0) / graded.length) : null;
    m.attendance.percent =
      m.attendance.total > 0 ? round1(((m.attendance.present + m.attendance.late) / m.attendance.total) * 100) : null;
    m.courses.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));
    m.missing.sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""));
    m.late.sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""));
  }

  return result;
}

export type RiskRule = "grade" | "attendance" | "missing_late" | "inactive";

export interface RiskFlag {
  rule: RiskRule;
  label: string;
}

export function riskFlags(m: StudentMetrics, t: RiskThresholds, now: Date = new Date()): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (m.averageGrade !== null && m.averageGrade < t.minGradePercent) {
    flags.push({ rule: "grade", label: `Average grade ${m.averageGrade}% (below ${t.minGradePercent}%)` });
  }
  if (m.attendance.percent !== null && m.attendance.percent < t.minAttendancePercent) {
    flags.push({ rule: "attendance", label: `Attendance ${m.attendance.percent}% (below ${t.minAttendancePercent}%)` });
  }
  const recent = m.recentMissingCount + m.recentLateCount;
  if (recent >= t.maxMissingOrLate) {
    flags.push({
      rule: "missing_late",
      label: `${m.recentMissingCount} missing, ${m.recentLateCount} late in the last ${RECENT_WORK_WINDOW_DAYS} days`,
    });
  }
  const inactiveSince = now.getTime() - t.inactiveDays * 86400000;
  if (!m.lastLoginAt || new Date(m.lastLoginAt).getTime() < inactiveSince) {
    flags.push({ rule: "inactive", label: `No login in ${t.inactiveDays}+ days` });
  }
  return flags;
}
