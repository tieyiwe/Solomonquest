import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// Pending assignments for current student
router.get("/assignments/pending", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId;

  // Get enrolled courses
  const { data: enrollments } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", userId ?? "")
    .eq("status", "active");

  const courseIds = (enrollments ?? []).map((e: Record<string, unknown>) => e.course_id as string);

  if (courseIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: assignments, error } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .in("course_id", courseIds)
    .eq("is_published", true)
    .order("due_date", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Filter out already submitted
  const { data: submitted } = await supabaseAdmin
    .from("submissions")
    .select("assignment_id")
    .eq("student_id", userId ?? "")
    .in("status", ["submitted", "graded"]);

  const submittedIds = new Set((submitted ?? []).map((s: Record<string, unknown>) => s.assignment_id as string));

  const pending = (assignments ?? []).filter(
    (a: Record<string, unknown>) => !submittedIds.has(a.id as string)
  );

  res.json(await Promise.all(pending.map(enrichAssignment)));
});

// List assignments for a course
router.get("/courses/:courseId/assignments", requireAuth, async (req, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("course_id", courseId)
    .order("due_date", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(await Promise.all((data ?? []).map(enrichAssignment)));
});

// Create assignment
router.post("/courses/:courseId/assignments", requireAuth, async (req, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;
  const { title, description, dueDate, pointsPossible } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .insert({
      course_id: courseId,
      title,
      description: description ?? null,
      due_date: dueDate ?? null,
      points_possible: pointsPossible ?? null,
      is_published: false,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(await enrichAssignment(data));
});

// Get assignment
router.get("/assignments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  res.json(await enrichAssignment(data));
});

// Update assignment
router.patch("/assignments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { title, description, dueDate, pointsPossible, isPublished } = req.body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (dueDate !== undefined) updates.due_date = dueDate;
  if (pointsPossible !== undefined) updates.points_possible = pointsPossible;
  if (isPublished !== undefined) updates.is_published = isPublished;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  res.json(await enrichAssignment(data));
});

// Delete assignment
router.delete("/assignments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { error } = await supabaseAdmin.from("assignments").delete().eq("id", id);

  if (error) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  res.sendStatus(204);
});

async function enrichAssignment(a: Record<string, unknown>) {
  let courseTitle: string | null = null;

  if (a.course_id) {
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("title")
      .eq("id", a.course_id as string)
      .single();
    if (course) courseTitle = course.title;
  }

  return {
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    description: a.description,
    dueDate: a.due_date,
    pointsPossible: a.points_possible,
    isPublished: a.is_published,
    courseTitle,
  };
}

export default router;
