import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { gradeSubmission } from "../lib/gradingEngine";

const router: IRouter = Router();

/** Verifies the caller may see/grade submissions for this assignment's course. */
async function assertAssignmentTeacherOrAdmin(
  req: AuthenticatedRequest,
  assignmentId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const { data: assignment, error } = await supabaseAdmin
    .from("assignments")
    .select("id, course_id, courses(school_id, teacher_id)")
    .eq("id", assignmentId)
    .single();

  if (error || !assignment) {
    return { ok: false, status: 404, error: "Assignment not found" };
  }

  const course = (assignment as any).courses as { school_id: string; teacher_id: string } | null;

  if (req.userRole === "teacher" && course?.teacher_id !== req.userId) {
    return { ok: false, status: 403, error: "You do not teach this course" };
  }

  if (req.userRole !== "super_admin" && course?.school_id !== req.schoolId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true };
}

// List submissions for an assignment
router.get("/assignments/:assignmentId/submissions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const assignmentId = Array.isArray(req.params.assignmentId)
    ? req.params.assignmentId[0]
    : req.params.assignmentId;

  const access = await assertAssignmentTeacherOrAdmin(req, assignmentId);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select("*")
    .eq("assignment_id", assignmentId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const submissions = await enrichSubmissions(data ?? []);
  res.json(submissions);
});

// Submit assignment
router.post("/assignments/:assignmentId/submissions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const assignmentId = Array.isArray(req.params.assignmentId)
    ? req.params.assignmentId[0]
    : req.params.assignmentId;

  // Security: this previously had NO check at all — any authenticated user
  // (any role, any school) could upsert a "submission" against any
  // assignment id, including ones in other schools or not yet published,
  // polluting gradebooks/analytics with fake rows. Only the enrolled
  // student themselves may submit, and only against a published
  // assignment they're actively enrolled in.
  if (req.userRole !== "student") {
    res.status(403).json({ error: "Only students can submit assignments" });
    return;
  }

  const { data: assignment } = await supabaseAdmin
    .from("assignments")
    .select("id, course_id, is_published")
    .eq("id", assignmentId)
    .single();

  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  if (!assignment.is_published) {
    res.status(403).json({ error: "This assignment is not yet published" });
    return;
  }

  const { data: enrollment } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("course_id", assignment.course_id as string)
    .eq("student_id", req.userId ?? "")
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment) {
    res.status(403).json({ error: "You are not enrolled in this course" });
    return;
  }

  const { content } = req.body;

  // Upsert submission
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .upsert(
      {
        assignment_id: assignmentId,
        student_id: req.userId,
        content: content ?? null,
        status: "submitted",
      },
      { onConflict: "assignment_id,student_id" }
    )
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(await enrichSubmission(data));
});

// Grade a submission
router.patch("/submissions/:id/grade", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { grade, rubricScores, feedback } = req.body as {
    grade?: number;
    rubricScores?: Record<string, number>;
    feedback?: string;
  };

  if ((grade === undefined || grade === null) && !rubricScores) {
    res.status(400).json({ error: "grade (or rubricScores) is required" });
    return;
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("submissions")
    .select("assignment_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  const access = await assertAssignmentTeacherOrAdmin(req, existing.assignment_id as string);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const result = await gradeSubmission({
    submissionId: id,
    grade,
    rubricScores,
    feedback,
    gradedBy: req.userId,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json(await enrichSubmission(result.submission));
});

async function enrichSubmission(s: Record<string, unknown>) {
  let studentName: string | null = null;

  if (s.student_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", s.student_id as string)
      .single();
    if (profile) {
      studentName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
    }
  }

  return {
    id: s.id,
    assignmentId: s.assignment_id,
    studentId: s.student_id,
    content: s.content,
    grade: s.grade,
    rubricScores: s.rubric_scores ?? null,
    feedback: s.feedback ?? null,
    gradedAt: s.graded_at ?? null,
    status: s.status,
    studentName,
  };
}

async function enrichSubmissions(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [];

  const studentIds = Array.from(
    new Set(rows.filter((s) => s.student_id).map((s) => s.student_id as string))
  );

  const { data: profiles } = studentIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", studentIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null])
  );

  return rows.map((s) => ({
    id: s.id,
    assignmentId: s.assignment_id,
    studentId: s.student_id,
    content: s.content,
    grade: s.grade,
    rubricScores: s.rubric_scores ?? null,
    feedback: s.feedback ?? null,
    gradedAt: s.graded_at ?? null,
    status: s.status,
    studentName: s.student_id ? nameById.get(s.student_id as string) ?? null : null,
  }));
}

export default router;
