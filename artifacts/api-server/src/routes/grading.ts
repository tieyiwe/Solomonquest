import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// GET /grading/submissions?course_id=X&assignment_id=Y
router.get("/submissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { course_id, assignment_id } = req.query;

    let query = supabaseAdmin
      .from("submissions")
      .select(`
        id,
        submitted_at,
        grade,
        feedback,
        graded_at,
        graded_by,
        student_id,
        assignment_id,
        profiles:student_id (
          id,
          full_name,
          email
        ),
        assignments:assignment_id (
          id,
          title,
          course_id
        )
      `);

    if (course_id) {
      query = query.eq("assignments.course_id", course_id as string);
    }
    if (assignment_id) {
      query = query.eq("assignment_id", assignment_id as string);
    }

    const { data, error } = await query;

    if (error) throw error;

    const submissions = (data || []).map((s: any) => ({
      id: s.id,
      submitted_at: s.submitted_at,
      grade: s.grade,
      feedback: s.feedback,
      graded_at: s.graded_at,
      graded_by: s.graded_by,
      student_id: s.student_id,
      student_name: s.profiles?.full_name ?? null,
      student_email: s.profiles?.email ?? null,
      assignment_id: s.assignment_id,
      assignment_title: s.assignments?.title ?? null,
    }));

    res.json({ submissions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /grading/submissions/:id
router.put("/submissions/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { grade, feedback } = req.body;
    const userId = req.user?.id;

    // Fetch submission to get student_id, assignment_id, etc.
    const { data: submission, error: fetchError } = await supabaseAdmin
      .from("submissions")
      .select(`
        id,
        student_id,
        assignment_id,
        assignments:assignment_id (
          id,
          title,
          course_id,
          school_id
        )
      `)
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const graded_at = new Date().toISOString();

    // Update submission
    const { data: updatedSubmission, error: updateError } = await supabaseAdmin
      .from("submissions")
      .update({
        grade,
        feedback,
        graded_by: userId,
        graded_at,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    const assignment = (submission as any).assignments;

    // Upsert into transcripts
    const { error: transcriptError } = await supabaseAdmin
      .from("transcripts")
      .upsert({
        student_id: submission.student_id,
        school_id: assignment?.school_id ?? null,
        course_id: assignment?.course_id ?? null,
        assignment_id: submission.assignment_id,
        submission_id: submission.id,
        grade,
        feedback,
        graded_at,
      }, {
        onConflict: "submission_id",
      });

    if (transcriptError) throw transcriptError;

    // Send notification to student
    const assignmentTitle = assignment?.title ?? "assignment";
    const { error: notifError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: submission.student_id,
        type: "grade",
        title: "Assignment Graded",
        message: `Your ${assignmentTitle} has been graded. Grade: ${grade}`,
        data: {
          submission_id: id,
          assignment_id: submission.assignment_id,
          grade,
        },
        read: false,
        created_at: new Date().toISOString(),
      });

    if (notifError) {
      console.error("Failed to send notification:", notifError.message);
    }

    res.json({ submission: updatedSubmission });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /grading/transcript/:student_id
router.get("/transcript/:student_id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { student_id } = req.params;
    const userId = req.user?.id;

    // Authorization: student themselves, teacher of those courses, or admin
    // We'll fetch data and let Supabase RLS handle it, but also do a basic check
    if (userId !== student_id) {
      // Check if requester is an admin or teacher
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("role, school_id")
        .eq("id", userId)
        .single();

      if (profileError) throw profileError;

      if (!profile || !["admin", "teacher", "super_admin"].includes(profile.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const { data: transcripts, error } = await supabaseAdmin
      .from("transcripts")
      .select(`
        id,
        grade,
        feedback,
        graded_at,
        course_id,
        assignment_id,
        submission_id,
        school_id,
        assignments:assignment_id (
          id,
          title,
          max_grade,
          due_date
        ),
        courses:course_id (
          id,
          name,
          code
        ),
        submissions:submission_id (
          id,
          submitted_at
        )
      `)
      .eq("student_id", student_id)
      .order("graded_at", { ascending: false });

    if (error) throw error;

    // Organize by course and calculate GPA
    const courseMap: Record<string, any> = {};

    for (const t of transcripts || []) {
      const course: any = (t as any).courses;
      const assignment: any = (t as any).assignments;
      const courseId = t.course_id ?? "unknown";

      if (!courseMap[courseId]) {
        courseMap[courseId] = {
          course_id: courseId,
          course_name: course?.name ?? null,
          course_code: course?.code ?? null,
          assignments: [],
          total_grade: 0,
          graded_count: 0,
          course_average: null,
        };
      }

      const numGrade = parseFloat(t.grade);
      if (!isNaN(numGrade)) {
        courseMap[courseId].total_grade += numGrade;
        courseMap[courseId].graded_count += 1;
      }

      courseMap[courseId].assignments.push({
        transcript_id: t.id,
        assignment_id: t.assignment_id,
        assignment_title: assignment?.title ?? null,
        max_grade: assignment?.max_grade ?? null,
        due_date: assignment?.due_date ?? null,
        grade: t.grade,
        feedback: t.feedback,
        graded_at: t.graded_at,
        submission_id: t.submission_id,
        submitted_at: (t as any).submissions?.submitted_at ?? null,
      });
    }

    // Calculate course averages and GPA
    let totalAverage = 0;
    let courseCount = 0;

    const courses = Object.values(courseMap).map((c: any) => {
      if (c.graded_count > 0) {
        c.course_average = parseFloat((c.total_grade / c.graded_count).toFixed(2));
        totalAverage += c.course_average;
        courseCount += 1;
      }
      delete c.total_grade;
      delete c.graded_count;
      return c;
    });

    const gpa = courseCount > 0 ? parseFloat((totalAverage / courseCount).toFixed(2)) : null;

    res.json({
      student_id,
      gpa,
      courses,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /grading/gradebook?course_id=X
router.get("/gradebook", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { course_id } = req.query;

    if (!course_id) {
      return res.status(400).json({ error: "course_id is required" });
    }

    // Get all assignments for the course
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from("assignments")
      .select("id, title, max_grade, due_date")
      .eq("course_id", course_id as string)
      .order("due_date", { ascending: true });

    if (assignmentsError) throw assignmentsError;

    // Get all enrollments for the course with student profiles
    const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
      .from("enrollments")
      .select(`
        student_id,
        profiles:student_id (
          id,
          full_name,
          email
        )
      `)
      .eq("course_id", course_id as string);

    if (enrollmentsError) throw enrollmentsError;

    const studentIds = (enrollments || []).map((e: any) => e.student_id);

    if (studentIds.length === 0) {
      return res.json({ course_id, assignments, students: [] });
    }

    // Get all submissions for these students and assignments in the course
    const assignmentIds = (assignments || []).map((a: any) => a.id);

    const { data: submissions, error: submissionsError } = await supabaseAdmin
      .from("submissions")
      .select("id, student_id, assignment_id, grade, feedback, submitted_at, graded_at")
      .in("student_id", studentIds)
      .in("assignment_id", assignmentIds);

    if (submissionsError) throw submissionsError;

    // Index submissions by student_id + assignment_id
    const submissionMap: Record<string, any> = {};
    for (const s of submissions || []) {
      submissionMap[`${s.student_id}:${s.assignment_id}`] = s;
    }

    // Build gradebook rows
    const students = (enrollments || []).map((enrollment: any) => {
      const profile = enrollment.profiles;
      const studentId = enrollment.student_id;

      const grades: any[] = (assignments || []).map((assignment: any) => {
        const sub = submissionMap[`${studentId}:${assignment.id}`] ?? null;
        return {
          assignment_id: assignment.id,
          assignment_title: assignment.title,
          max_grade: assignment.max_grade,
          submission_id: sub?.id ?? null,
          submitted_at: sub?.submitted_at ?? null,
          grade: sub?.grade ?? null,
          feedback: sub?.feedback ?? null,
          graded_at: sub?.graded_at ?? null,
        };
      });

      // Calculate course average for this student
      const gradedItems = grades.filter((g) => g.grade !== null && !isNaN(parseFloat(g.grade)));
      const courseAverage =
        gradedItems.length > 0
          ? parseFloat(
              (
                gradedItems.reduce((sum, g) => sum + parseFloat(g.grade), 0) / gradedItems.length
              ).toFixed(2)
            )
          : null;

      return {
        student_id: studentId,
        student_name: profile?.full_name ?? null,
        student_email: profile?.email ?? null,
        course_average: courseAverage,
        grades,
      };
    });

    res.json({
      course_id,
      assignments,
      students,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
