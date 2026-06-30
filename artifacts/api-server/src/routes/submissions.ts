import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// List submissions for an assignment
router.get("/assignments/:assignmentId/submissions", requireAuth, async (req, res): Promise<void> => {
  const assignmentId = Array.isArray(req.params.assignmentId)
    ? req.params.assignmentId[0]
    : req.params.assignmentId;

  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select("*")
    .eq("assignment_id", assignmentId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const submissions = await Promise.all((data ?? []).map(enrichSubmission));
  res.json(submissions);
});

// Submit assignment
router.post("/assignments/:assignmentId/submissions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const assignmentId = Array.isArray(req.params.assignmentId)
    ? req.params.assignmentId[0]
    : req.params.assignmentId;

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
router.patch("/submissions/:id/grade", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { grade } = req.body;

  if (grade === undefined || grade === null) {
    res.status(400).json({ error: "grade is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("submissions")
    .update({ grade, status: "graded" })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  res.json(await enrichSubmission(data));
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
    status: s.status,
    studentName,
  };
}

export default router;
