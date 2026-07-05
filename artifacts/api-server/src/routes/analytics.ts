import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ─── GET /analytics/admin ────────────────────────────────────────────────────

router.get("/analytics/admin", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const schoolId = req.schoolId ?? "";

  try {
    // ── Enrollments over time (last 12 months) ──────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const { data: enrollmentRows } = await supabaseAdmin
      .from("course_enrollments")
      .select("enrolled_at, courses!inner(school_id)")
      .eq("courses.school_id", schoolId)
      .gte("enrolled_at", twelveMonthsAgo.toISOString())
      .eq("status", "active");

    // Bucket by YYYY-MM
    const buckets: Record<string, number> = {};
    // Pre-fill all 12 months with 0
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets[key] = 0;
    }
    for (const row of enrollmentRows ?? []) {
      const d = new Date((row as any).enrolled_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in buckets) buckets[key]++;
    }
    const enrollments_over_time = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // ── Application funnel ──────────────────────────────────────────────────
    const [
      { count: submitted },
      { count: under_review },
      { count: approved },
      { count: rejected },
    ] = await Promise.all([
      supabaseAdmin.from("student_applications").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "submitted"),
      supabaseAdmin.from("student_applications").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "under_review"),
      supabaseAdmin.from("student_applications").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "approved"),
      supabaseAdmin.from("student_applications").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "rejected"),
    ]);
    const application_funnel = {
      submitted: submitted ?? 0,
      under_review: under_review ?? 0,
      approved: approved ?? 0,
      rejected: rejected ?? 0,
    };

    // ── Top 5 courses ───────────────────────────────────────────────────────
    const { data: courseRows } = await supabaseAdmin
      .from("courses")
      .select("id, title")
      .eq("school_id", schoolId);

    const courseList = courseRows ?? [];
    const courseIds = courseList.map((c: any) => c.id as string);

    let top_courses: { course_id: string; name: string; enrolled_count: number; avg_grade: number | null }[] = [];

    if (courseIds.length > 0) {
      // Enrollment counts per course
      const { data: enrollData } = await supabaseAdmin
        .from("course_enrollments")
        .select("course_id")
        .in("course_id", courseIds)
        .eq("status", "active");

      const enrollCount: Record<string, number> = {};
      for (const e of enrollData ?? []) {
        enrollCount[(e as any).course_id] = (enrollCount[(e as any).course_id] ?? 0) + 1;
      }

      // Avg grades per course via submissions -> assignments
      const { data: assignRows } = await supabaseAdmin
        .from("assignments")
        .select("id, course_id")
        .in("course_id", courseIds);

      const assignToCourse: Record<string, string> = {};
      for (const a of assignRows ?? []) {
        assignToCourse[(a as any).id] = (a as any).course_id;
      }

      const assignIds = Object.keys(assignToCourse);
      const gradesByCourse: Record<string, number[]> = {};

      if (assignIds.length > 0) {
        const { data: subRows } = await supabaseAdmin
          .from("submissions")
          .select("assignment_id, grade")
          .in("assignment_id", assignIds)
          .not("grade", "is", null);

        for (const s of subRows ?? []) {
          const cid = assignToCourse[(s as any).assignment_id];
          if (!gradesByCourse[cid]) gradesByCourse[cid] = [];
          gradesByCourse[cid].push((s as any).grade as number);
        }
      }

      top_courses = courseList
        .map((c: any) => {
          const grades = gradesByCourse[c.id] ?? [];
          const avg_grade = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : null;
          return {
            course_id: c.id as string,
            name: c.title as string,
            enrolled_count: enrollCount[c.id] ?? 0,
            avg_grade: avg_grade !== null ? Math.round(avg_grade * 10) / 10 : null,
          };
        })
        .sort((a: any, b: any) => b.enrolled_count - a.enrolled_count)
        .slice(0, 5);
    }

    // ── Student activity ────────────────────────────────────────────────────
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { count: active_this_week } = await supabaseAdmin
      .from("submissions")
      .select("student_id", { count: "exact", head: true })
      .gte("submitted_at", oneWeekAgo.toISOString());

    // Avg assignments submitted per student
    let avg_assignments_submitted = 0;
    const { count: totalStudentsCount } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("role", "student");

    if ((totalStudentsCount ?? 0) > 0 && courseIds.length > 0) {
      const allAssignIds: string[] = [];
      const { data: allAssigns } = await supabaseAdmin
        .from("assignments")
        .select("id")
        .in("course_id", courseIds);
      allAssignIds.push(...(allAssigns ?? []).map((a: any) => a.id as string));

      if (allAssignIds.length > 0) {
        const { count: totalSubs } = await supabaseAdmin
          .from("submissions")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", allAssignIds);

        avg_assignments_submitted = Math.round(((totalSubs ?? 0) / (totalStudentsCount ?? 1)) * 10) / 10;
      }
    }

    const student_activity = {
      active_this_week: active_this_week ?? 0,
      avg_assignments_submitted,
    };

    // ── Teacher performance ─────────────────────────────────────────────────
    const { data: teacherRows } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, full_name")
      .eq("school_id", schoolId)
      .eq("role", "teacher");

    const teacherList = teacherRows ?? [];
    let teacher_performance: { teacher_id: string; name: string; courses: number; avg_student_grade: number | null }[] = [];

    if (teacherList.length > 0) {
      const teacherIds = teacherList.map((t: any) => t.id as string);

      const { data: teacherCourses } = await supabaseAdmin
        .from("courses")
        .select("id, teacher_id")
        .eq("school_id", schoolId)
        .in("teacher_id", teacherIds);

      const coursesByTeacher: Record<string, string[]> = {};
      for (const c of teacherCourses ?? []) {
        if (!coursesByTeacher[(c as any).teacher_id]) coursesByTeacher[(c as any).teacher_id] = [];
        coursesByTeacher[(c as any).teacher_id].push((c as any).id as string);
      }

      // Grades per teacher
      const gradesByTeacher: Record<string, number[]> = {};
      const allTeacherCourseIds = Object.values(coursesByTeacher).flat();

      if (allTeacherCourseIds.length > 0) {
        const { data: tAssigns } = await supabaseAdmin
          .from("assignments")
          .select("id, course_id")
          .in("course_id", allTeacherCourseIds);

        const tAssignToCourse: Record<string, string> = {};
        for (const a of tAssigns ?? []) {
          tAssignToCourse[(a as any).id] = (a as any).course_id;
        }

        const tAssignIds = Object.keys(tAssignToCourse);
        if (tAssignIds.length > 0) {
          const { data: tSubs } = await supabaseAdmin
            .from("submissions")
            .select("assignment_id, grade")
            .in("assignment_id", tAssignIds)
            .not("grade", "is", null);

          // Map course -> teacher
          const courseToTeacher: Record<string, string> = {};
          for (const [tid, cids] of Object.entries(coursesByTeacher)) {
            for (const cid of cids) courseToTeacher[cid] = tid;
          }

          for (const s of tSubs ?? []) {
            const cid = tAssignToCourse[(s as any).assignment_id];
            const tid = courseToTeacher[cid];
            if (tid) {
              if (!gradesByTeacher[tid]) gradesByTeacher[tid] = [];
              gradesByTeacher[tid].push((s as any).grade as number);
            }
          }
        }
      }

      teacher_performance = teacherList.map((t: any) => {
        const name = t.full_name ?? (`${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "Unknown");
        const grades = gradesByTeacher[t.id] ?? [];
        const avg = grades.length > 0 ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : null;
        return {
          teacher_id: t.id as string,
          name,
          courses: (coursesByTeacher[t.id] ?? []).length,
          avg_student_grade: avg,
        };
      });
    }

    res.json({
      enrollments_over_time,
      application_funnel,
      top_courses,
      student_activity,
      teacher_performance,
    });
  } catch (err: any) {
    console.error("[analytics/admin]", err);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// ─── GET /analytics/teacher ──────────────────────────────────────────────────

router.get("/analytics/teacher", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (role !== "teacher" && role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const userId = req.userId ?? "";
  const schoolId = req.schoolId ?? "";

  try {
    // Teacher's courses
    const { data: myCourseRows } = await supabaseAdmin
      .from("courses")
      .select("id, title")
      .eq("school_id", schoolId)
      .eq("teacher_id", userId);

    const myCourses = myCourseRows ?? [];
    const myCourseIds = myCourses.map((c: any) => c.id as string);

    // ── Per-course stats ────────────────────────────────────────────────────
    let courses: {
      course_id: string;
      name: string;
      enrolled_count: number;
      avg_grade: number | null;
      assignment_completion_rate: number | null;
      attendance_rate: number | null;
      quiz_avg_score: number | null;
    }[] = [];

    if (myCourseIds.length > 0) {
      // Enrollment counts
      const { data: enrollData } = await supabaseAdmin
        .from("course_enrollments")
        .select("course_id, student_id")
        .in("course_id", myCourseIds)
        .eq("status", "active");

      const enrollByCourse: Record<string, string[]> = {};
      for (const e of enrollData ?? []) {
        if (!enrollByCourse[(e as any).course_id]) enrollByCourse[(e as any).course_id] = [];
        enrollByCourse[(e as any).course_id].push((e as any).student_id as string);
      }

      // Assignments
      const { data: assignData } = await supabaseAdmin
        .from("assignments")
        .select("id, course_id")
        .in("course_id", myCourseIds);

      const assignByCourse: Record<string, string[]> = {};
      const assignToCourse: Record<string, string> = {};
      for (const a of assignData ?? []) {
        if (!assignByCourse[(a as any).course_id]) assignByCourse[(a as any).course_id] = [];
        assignByCourse[(a as any).course_id].push((a as any).id as string);
        assignToCourse[(a as any).id] = (a as any).course_id;
      }

      const allAssignIds = Object.keys(assignToCourse);
      let subRows: any[] = [];
      if (allAssignIds.length > 0) {
        const { data } = await supabaseAdmin
          .from("submissions")
          .select("assignment_id, student_id, grade, submitted_at")
          .in("assignment_id", allAssignIds);
        subRows = data ?? [];
      }

      // Submissions grouped by course
      const subsByCourse: Record<string, typeof subRows> = {};
      for (const s of subRows) {
        const cid = assignToCourse[s.assignment_id];
        if (!subsByCourse[cid]) subsByCourse[cid] = [];
        subsByCourse[cid].push(s);
      }

      // Attendance
      const { data: attendanceData } = await supabaseAdmin
        .from("attendance")
        .select("course_id, student_id, status, session_date")
        .in("course_id", myCourseIds);

      const attendByCourse: Record<string, any[]> = {};
      for (const a of attendanceData ?? []) {
        if (!attendByCourse[(a as any).course_id]) attendByCourse[(a as any).course_id] = [];
        attendByCourse[(a as any).course_id].push(a);
      }

      // Quiz scores
      const { data: quizAttempts } = await supabaseAdmin
        .from("quiz_attempts")
        .select("quiz_id, score, quizzes!inner(course_id)")
        .in("quizzes.course_id", myCourseIds);

      const quizScoresByCourse: Record<string, number[]> = {};
      for (const qa of quizAttempts ?? []) {
        const cid = (qa as any).quizzes?.course_id;
        if (cid) {
          if (!quizScoresByCourse[cid]) quizScoresByCourse[cid] = [];
          quizScoresByCourse[cid].push((qa as any).score as number);
        }
      }

      courses = myCourses.map((c: any) => {
        const enrolled = enrollByCourse[c.id] ?? [];
        const enrolledCount = enrolled.length;
        const courseAssigns = assignByCourse[c.id] ?? [];
        const courseSubs = subsByCourse[c.id] ?? [];

        // Avg grade
        const grades = courseSubs.filter((s) => s.grade !== null).map((s) => s.grade as number);
        const avg_grade = grades.length > 0 ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : null;

        // Assignment completion rate: % of enrolled students who submitted each assignment on avg
        let assignment_completion_rate: number | null = null;
        if (courseAssigns.length > 0 && enrolledCount > 0) {
          const submittedPerAssign = courseAssigns.map((aid) => {
            const uniq = new Set(courseSubs.filter((s) => s.assignment_id === aid).map((s) => s.student_id));
            return uniq.size;
          });
          const avgSubmitted = submittedPerAssign.reduce((a, b) => a + b, 0) / courseAssigns.length;
          assignment_completion_rate = Math.round((avgSubmitted / enrolledCount) * 1000) / 10;
        }

        // Attendance rate
        let attendance_rate: number | null = null;
        const attendRecords = attendByCourse[c.id] ?? [];
        if (attendRecords.length > 0 && enrolledCount > 0) {
          // Group by session_date to get distinct live class days
          const byDate: Record<string, { present: number; total: number }> = {};
          for (const r of attendRecords) {
            const day = (r as any).session_date ?? "unknown";
            if (!byDate[day]) byDate[day] = { present: 0, total: 0 };
            byDate[day].total++;
            if ((r as any).status === "present") byDate[day].present++;
          }
          const rates = Object.values(byDate).map((d) => d.total > 0 ? d.present / d.total : 0);
          const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
          attendance_rate = Math.round(avg * 1000) / 10;
        }

        // Quiz avg score
        const qScores = quizScoresByCourse[c.id] ?? [];
        const quiz_avg_score = qScores.length > 0 ? Math.round((qScores.reduce((a, b) => a + b, 0) / qScores.length) * 10) / 10 : null;

        return {
          course_id: c.id as string,
          name: c.title as string,
          enrolled_count: enrolledCount,
          avg_grade,
          assignment_completion_rate,
          attendance_rate,
          quiz_avg_score,
        };
      });
    }

    // ── Grade distribution (across all teacher's courses) ──────────────────
    const allAssignIdsForDist: string[] = [];
    for (const c of myCourses) {
      // already computed above, but re-derive from myCourseIds
    }

    let allGrades: number[] = [];
    if (myCourseIds.length > 0) {
      const { data: dAssigns } = await supabaseAdmin
        .from("assignments")
        .select("id")
        .in("course_id", myCourseIds);
      const dAssignIds = (dAssigns ?? []).map((a: any) => a.id as string);

      if (dAssignIds.length > 0) {
        const { data: dSubs } = await supabaseAdmin
          .from("submissions")
          .select("grade")
          .in("assignment_id", dAssignIds)
          .not("grade", "is", null);

        allGrades = (dSubs ?? []).map((s: any) => s.grade as number);
      }
    }

    const grade_distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const g of allGrades) {
      if (g >= 90) grade_distribution.A++;
      else if (g >= 80) grade_distribution.B++;
      else if (g >= 70) grade_distribution.C++;
      else if (g >= 60) grade_distribution.D++;
      else grade_distribution.F++;
    }

    // ── Recent submissions ──────────────────────────────────────────────────
    let recent_submissions: { student_name: string; assignment_title: string; submitted_at: string; grade: number | null }[] = [];

    if (myCourseIds.length > 0) {
      const { data: rAssigns } = await supabaseAdmin
        .from("assignments")
        .select("id, title")
        .in("course_id", myCourseIds);

      const assignIdToTitle: Record<string, string> = {};
      for (const a of rAssigns ?? []) {
        assignIdToTitle[(a as any).id] = (a as any).title as string;
      }

      const rAssignIds = Object.keys(assignIdToTitle);
      if (rAssignIds.length > 0) {
        const { data: rSubs } = await supabaseAdmin
          .from("submissions")
          .select("assignment_id, student_id, submitted_at, grade, profiles:student_id(full_name, first_name, last_name)")
          .in("assignment_id", rAssignIds)
          .order("submitted_at", { ascending: false })
          .limit(10);

        recent_submissions = (rSubs ?? []).map((s: any) => {
          const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
          const name = profile?.full_name ?? (`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Unknown");
          return {
            student_name: name,
            assignment_title: assignIdToTitle[s.assignment_id] ?? "Unknown",
            submitted_at: s.submitted_at as string,
            grade: s.grade as number | null,
          };
        });
      }
    }

    res.json({
      courses,
      grade_distribution,
      recent_submissions,
    });
  } catch (err: any) {
    console.error("[analytics/teacher]", err);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

export default router;
