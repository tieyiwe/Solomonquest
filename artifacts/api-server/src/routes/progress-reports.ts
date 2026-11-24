import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  computeStudentMetrics,
  getRiskThresholds,
  riskFlags,
  DEFAULT_RISK_THRESHOLDS,
  RECENT_WORK_WINDOW_DAYS,
} from "../lib/studentProgress";

/**
 * Progress reports and at-risk alerts.
 *
 *   GET /at-risk[?courseId=]            admin: whole school; teacher: courses they teach
 *   GET /at-risk/settings               admin/teacher: the school's thresholds
 *   PUT /at-risk/settings               admin: update thresholds
 *   GET /students/:id/progress-report   admin (same school), the student's teachers
 *                                       (their courses only), the student ("me"),
 *                                       linked parents, super_admin
 */
const router: IRouter = Router();

function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function isAdmin(role?: string) {
  return role === "admin" || role === "super_admin";
}

/** School the caller acts for. super_admin may pass ?schoolId=. */
function callerSchoolId(req: AuthenticatedRequest): string | null {
  if (req.userRole === "super_admin" && typeof req.query.schoolId === "string" && req.query.schoolId) {
    return req.query.schoolId;
  }
  return req.schoolId ?? null;
}

function fullName(p: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Student";
}

router.get("/at-risk/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isAdmin(req.userRole) && req.userRole !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const t = await getRiskThresholds(callerSchoolId(req));
  res.json({ ...t, defaults: DEFAULT_RISK_THRESHOLDS, recentWindowDays: RECENT_WORK_WINDOW_DAYS });
});

router.put("/at-risk/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isAdmin(req.userRole)) {
    res.status(403).json({ error: "Only school admins can change at-risk thresholds" });
    return;
  }
  const schoolId = callerSchoolId(req);
  if (!schoolId) {
    res.status(400).json({ error: "No school associated with this account" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: [keyof typeof DEFAULT_RISK_THRESHOLDS, string, number, number, boolean][] = [
    ["minGradePercent", "min_grade_percent", 0, 100, false],
    ["minAttendancePercent", "min_attendance_percent", 0, 100, false],
    ["maxMissingOrLate", "max_missing_or_late", 1, 100, true],
    ["inactiveDays", "inactive_days", 1, 365, true],
  ];
  const row: Record<string, unknown> = { school_id: schoolId, updated_by: req.userId ?? null, updated_at: new Date().toISOString() };
  for (const [key, column, min, max, integer] of fields) {
    const raw = body[key];
    const n = raw === undefined ? DEFAULT_RISK_THRESHOLDS[key] : Number(raw);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      res.status(400).json({ error: `${key} must be ${integer ? "a whole number " : ""}between ${min} and ${max}` });
      return;
    }
    row[column] = n;
  }
  const { error } = await supabaseAdmin.from("school_risk_settings").upsert(row, { onConflict: "school_id" });
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  const t = await getRiskThresholds(schoolId);
  res.json({ ...t, defaults: DEFAULT_RISK_THRESHOLDS, recentWindowDays: RECENT_WORK_WINDOW_DAYS });
});

router.get("/at-risk", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isAdmin(req.userRole) && req.userRole !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const schoolId = callerSchoolId(req);
  if (!schoolId) {
    res.status(400).json({ error: "No school associated with this account" });
    return;
  }

  let courseQuery = supabaseAdmin.from("courses").select("id, title").eq("school_id", schoolId);
  if (req.userRole === "teacher") courseQuery = courseQuery.eq("teacher_id", req.userId ?? "");
  const { data: courses, error: courseError } = await courseQuery;
  if (courseError) {
    res.status(500).json({ error: courseError.message });
    return;
  }
  let courseIds = (courses ?? []).map((c) => c.id as string);
  const courseFilter = typeof req.query.courseId === "string" ? req.query.courseId : "";
  if (courseFilter) {
    if (!courseIds.includes(courseFilter)) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    courseIds = [courseFilter];
  }

  const thresholds = await getRiskThresholds(schoolId);
  const now = new Date();
  const metrics = await computeStudentMetrics({
    courseIds,
    loginLookbackDays: Math.max(thresholds.inactiveDays, 90),
    now,
  });

  const ids = Array.from(metrics.keys());
  const profiles: Record<string, any>[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, avatar_url, role, school_id")
      .in("id", ids.slice(i, i + 150));
    profiles.push(...(data ?? []));
  }
  // Only actual students of this school (enrollments can outlive a role change).
  const profileById = new Map(
    profiles.filter((p) => p.role === "student" && p.school_id === schoolId).map((p) => [p.id as string, p])
  );

  const students = [];
  for (const m of metrics.values()) {
    const p = profileById.get(m.studentId);
    if (!p) continue;
    const flags = riskFlags(m, thresholds, now);
    if (flags.length === 0) continue;
    students.push({
      studentId: m.studentId,
      name: fullName(p),
      email: (p.email as string | null) ?? null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      flags,
      averageGrade: m.averageGrade,
      attendancePercent: m.attendance.percent,
      recentMissingCount: m.recentMissingCount,
      recentLateCount: m.recentLateCount,
      lastLoginAt: m.lastLoginAt,
      courses: m.courses.map((c) => ({ courseId: c.courseId, courseTitle: c.courseTitle, gradePercent: c.gradePercent })),
    });
  }
  students.sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name));

  res.json({
    thresholds,
    recentWindowDays: RECENT_WORK_WINDOW_DAYS,
    totalStudents: profileById.size,
    courses: (courses ?? []).map((c) => ({ id: c.id, title: c.title })),
    students,
  });
});

router.get("/students/:id/progress-report", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const rawId = param(req.params.id);
  const studentId = rawId === "me" ? req.userId ?? "" : rawId;
  const role = req.userRole;

  const { data: student } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url, unique_student_id, role, school_id, schools(name)")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || student.role !== "student") {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const { data: enrollments } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .eq("status", "active");
  let courseIds = (enrollments ?? []).map((e) => e.course_id as string);

  // Access: who may see this student's report, and which courses they see.
  let allowed = false;
  let scope: "full" | "teacher" = "full";
  if (role === "super_admin") allowed = true;
  else if (role === "admin") allowed = student.school_id === req.schoolId;
  else if (role === "student") allowed = studentId === req.userId;
  else if (role === "parent") {
    const { data: link } = await supabaseAdmin
      .from("parent_student_links")
      .select("id")
      .eq("parent_id", req.userId ?? "")
      .eq("student_id", studentId)
      .maybeSingle();
    allowed = !!link;
  } else if (role === "teacher" && courseIds.length > 0) {
    // Teachers see the report limited to the courses they teach this student.
    const { data: mine } = await supabaseAdmin
      .from("courses")
      .select("id")
      .eq("teacher_id", req.userId ?? "")
      .in("id", courseIds);
    courseIds = (mine ?? []).map((c) => c.id as string);
    allowed = courseIds.length > 0;
    scope = "teacher";
  }
  if (!allowed) {
    res.status(403).json({ error: "You do not have access to this student's report" });
    return;
  }

  const now = new Date();
  const thresholds = await getRiskThresholds(student.school_id as string | null);
  const metrics = (
    await computeStudentMetrics({ courseIds, studentIds: [studentId], loginLookbackDays: 90, now })
  ).get(studentId);

  // Teacher names for each course.
  const teacherIds = Array.from(new Set((metrics?.courses ?? []).map((c) => c.teacherId).filter((t): t is string => !!t)));
  const { data: teachers } = teacherIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", teacherIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
  const teacherName = new Map((teachers ?? []).map((t) => [t.id as string, fullName(t)]));

  // Recent activity: submissions, quiz attempts, logins.
  const [subsRes, attemptsRes, loginsRes] = await Promise.all([
    supabaseAdmin
      .from("submissions")
      .select("submitted_at, status, assignments:assignment_id (title, course_id)")
      .eq("student_id", studentId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("quiz_attempts")
      .select("submitted_at, score, quizzes:quiz_id (title, course_id)")
      .eq("student_id", studentId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("platform_audit_log")
      .select("created_at")
      .eq("action", "login")
      .eq("performed_by", studentId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const inScope = new Set(courseIds);
  const activity: { type: string; description: string; at: string }[] = [];
  for (const s of (subsRes.data ?? []) as Record<string, any>[]) {
    if (!s.assignments || !inScope.has(s.assignments.course_id)) continue;
    activity.push({ type: "submission", description: `Submitted "${s.assignments.title}"`, at: s.submitted_at });
  }
  for (const a of (attemptsRes.data ?? []) as Record<string, any>[]) {
    if (!a.quizzes || !inScope.has(a.quizzes.course_id) || !a.submitted_at) continue;
    activity.push({ type: "quiz", description: `Completed quiz "${a.quizzes.title}"`, at: a.submitted_at });
  }
  if (scope === "full") {
    for (const l of loginsRes.data ?? []) activity.push({ type: "login", description: "Signed in", at: l.created_at as string });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  const school = student.schools as { name?: string } | { name?: string }[] | null;
  res.json({
    generatedAt: now.toISOString(),
    scope,
    student: {
      id: student.id,
      name: fullName(student),
      email: student.email ?? null,
      avatarUrl: student.avatar_url ?? null,
      uniqueStudentId: student.unique_student_id ?? null,
      schoolName: (Array.isArray(school) ? school[0]?.name : school?.name) ?? null,
    },
    summary: {
      averageGrade: metrics?.averageGrade ?? null,
      attendancePercent: metrics?.attendance.percent ?? null,
      attendance: metrics?.attendance ?? { present: 0, absent: 0, late: 0, total: 0, percent: null },
      missingCount: metrics?.missing.length ?? 0,
      lateCount: metrics?.late.length ?? 0,
      lastLoginAt: metrics?.lastLoginAt ?? null,
      flags: metrics ? riskFlags(metrics, thresholds, now) : [],
    },
    courses: (metrics?.courses ?? []).map((c) => ({
      courseId: c.courseId,
      courseTitle: c.courseTitle,
      teacherName: c.teacherId ? teacherName.get(c.teacherId) ?? null : null,
      gradePercent: c.gradePercent,
      letterGrade: c.letterGrade,
      attendancePercent: c.attendancePercent,
      assignmentsPublished: c.assignmentsPublished,
      assignmentsSubmitted: c.assignmentsSubmitted,
      missingCount: c.missingCount,
      lateCount: c.lateCount,
      quizzesTaken: c.quizzesTaken,
      completionPercent: c.completionPercent,
    })),
    missingWork: metrics?.missing ?? [],
    lateWork: metrics?.late ?? [],
    recentActivity: activity.slice(0, 15),
  });
});

export default router;
