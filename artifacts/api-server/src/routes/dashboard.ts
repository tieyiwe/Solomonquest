import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// Admin stats
router.get("/dashboard/admin/stats", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = req.schoolId ?? "";

  const [
    { count: totalStudents },
    { count: totalTeachers },
    { count: totalCourses },
    { count: pendingApplications },
    { count: activePrograms },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "student"),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "teacher"),
    supabaseAdmin.from("courses").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabaseAdmin.from("student_applications").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "submitted"),
    supabaseAdmin.from("programs").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
  ]);

  // Recent activity: latest announcements + applications
  const { data: recentAnnouncements } = await supabaseAdmin
    .from("announcements")
    .select("id, title, created_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(3);

  const { data: recentApplications } = await supabaseAdmin
    .from("student_applications")
    .select("id, status, created_at")
    .eq("school_id", schoolId)
    .order("created_at" as string, { ascending: false })
    .limit(3);

  const recentActivity = [
    ...(recentAnnouncements ?? []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      type: "announcement",
      description: `Announcement: ${a.title}`,
      createdAt: a.created_at as string,
    })),
    ...(recentApplications ?? []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      type: "application",
      description: `New application (${a.status})`,
      createdAt: a.created_at as string,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  res.json({
    totalStudents: totalStudents ?? 0,
    totalTeachers: totalTeachers ?? 0,
    totalCourses: totalCourses ?? 0,
    pendingApplications: pendingApplications ?? 0,
    activePrograms: activePrograms ?? 0,
    recentActivity,
  });
});

// Teacher stats
router.get("/dashboard/teacher/stats", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId ?? "";

  const { data: myCourses } = await supabaseAdmin
    .from("courses")
    .select("id")
    .eq("teacher_id", userId);

  const courseIds = (myCourses ?? []).map((c: Record<string, unknown>) => c.id as string);
  const totalCourses = courseIds.length;

  let totalStudents = 0;
  let pendingGrading = 0;

  if (courseIds.length > 0) {
    const { count: studentCount } = await supabaseAdmin
      .from("course_enrollments")
      .select("*", { count: "exact", head: true })
      .in("course_id", courseIds)
      .eq("status", "active");

    totalStudents = studentCount ?? 0;

    const { data: assignmentData } = await supabaseAdmin
      .from("assignments")
      .select("id")
      .in("course_id", courseIds);

    const assignmentIds = (assignmentData ?? []).map((a: Record<string, unknown>) => a.id as string);

    if (assignmentIds.length > 0) {
      const { count: pendingCount } = await supabaseAdmin
        .from("submissions")
        .select("*", { count: "exact", head: true })
        .in("assignment_id", assignmentIds)
        .eq("status", "submitted");

      pendingGrading = pendingCount ?? 0;
    }
  }

  // Recent activity
  const recentActivity = courseIds.length > 0 ? await (async () => {
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id, status, created_at")
      .in("assignment_id",
        courseIds.length > 0
          ? ((await supabaseAdmin.from("assignments").select("id").in("course_id", courseIds)).data ?? []).map((a: Record<string, unknown>) => a.id as string)
          : ["__none__"]
      )
      .order("created_at", { ascending: false })
      .limit(5);

    return (subs ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      type: "submission",
      description: `New submission (${s.status})`,
      createdAt: s.created_at as string,
    }));
  })() : [];

  res.json({
    totalCourses,
    totalStudents,
    pendingGrading,
    recentActivity,
  });
});

// Student stats
router.get("/dashboard/student/stats", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId ?? "";

  const { data: enrollments } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", userId)
    .eq("status", "active");

  const courseIds = (enrollments ?? []).map((e: Record<string, unknown>) => e.course_id as string);
  const enrolledCourses = courseIds.length;

  let pendingAssignments = 0;
  let averageGrade: number | null = null;

  if (courseIds.length > 0) {
    const { data: assignments } = await supabaseAdmin
      .from("assignments")
      .select("id")
      .in("course_id", courseIds)
      .eq("is_published", true);

    const assignmentIds = (assignments ?? []).map((a: Record<string, unknown>) => a.id as string);

    if (assignmentIds.length > 0) {
      const { data: submitted } = await supabaseAdmin
        .from("submissions")
        .select("assignment_id, grade")
        .eq("student_id", userId)
        .in("assignment_id", assignmentIds);

      const submittedIds = new Set((submitted ?? []).map((s: Record<string, unknown>) => s.assignment_id as string));
      pendingAssignments = assignmentIds.filter((id) => !submittedIds.has(id)).length;

      const grades = (submitted ?? [])
        .map((s: Record<string, unknown>) => s.grade as number | null)
        .filter((g): g is number => g !== null);

      if (grades.length > 0) {
        averageGrade = grades.reduce((sum, g) => sum + g, 0) / grades.length;
      }
    }
  }

  // Recent activity
  const { data: mySubmissions } = await supabaseAdmin
    .from("submissions")
    .select("id, status, created_at")
    .eq("student_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  const recentActivity = (mySubmissions ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    type: "submission",
    description: `Assignment ${s.status}`,
    createdAt: s.created_at as string,
  }));

  res.json({
    enrolledCourses,
    pendingAssignments,
    averageGrade,
    recentActivity,
  });
});

export default router;
