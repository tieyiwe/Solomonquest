import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { enrollStudentInCourse } from "../lib/enrollment";

const router: IRouter = Router();

router.get("/programs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from("programs")
    .select("*")
    .eq("school_id", req.schoolId ?? "")
    .order("name");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json((data ?? []).map(mapProgram));
});

router.post("/programs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { name, code, description, level } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("programs")
    .insert({
      school_id: req.schoolId,
      name,
      code: code ?? null,
      description: description ?? null,
      level: level ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(mapProgram(data));
});

router.get("/programs/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  let query = supabaseAdmin.from("programs").select("*").eq("id", id);
  if (req.userRole !== "super_admin") {
    query = query.eq("school_id", req.schoolId ?? "");
  }

  const { data, error } = await query.single();

  if (error || !data) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.json(mapProgram(data));
});

router.patch("/programs/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, code, description, level, isActive } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (code !== undefined) updates.code = code;
  if (description !== undefined) updates.description = description;
  if (level !== undefined) updates.level = level;
  if (isActive !== undefined) updates.is_active = isActive;

  let query = supabaseAdmin.from("programs").update(updates).eq("id", id);
  if (req.userRole !== "super_admin") {
    query = query.eq("school_id", req.schoolId ?? "");
  }

  const { data, error } = await query.select().single();

  if (error || !data) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.json(mapProgram(data));
});

router.delete("/programs/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  let query = supabaseAdmin.from("programs").delete().eq("id", id);
  if (req.userRole !== "super_admin") {
    query = query.eq("school_id", req.schoolId ?? "");
  }

  const { error } = await query;

  if (error) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.sendStatus(204);
});

// ─── POST /programs/:id/enroll-student ────────────────────────────────────────
// Retroactively places a student into a program -- e.g. a transferring
// student invited without a program picked at invite time. Enrolls them in
// every course currently in the program via the normal cascade helper.
router.post(
  "/programs/:id/enroll-student",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { studentId } = req.body as { studentId?: string };

    if (!studentId) {
      res.status(400).json({ error: "studentId is required" });
      return;
    }

    const { data: program } = await supabaseAdmin
      .from("programs")
      .select("id")
      .eq("id", id)
      .eq("school_id", req.schoolId ?? "")
      .maybeSingle();
    if (!program) {
      res.status(404).json({ error: "Program not found" });
      return;
    }

    const { data: student } = await supabaseAdmin
      .from("profiles")
      .select("id, role, school_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!student || student.school_id !== req.schoolId || student.role !== "student") {
      res.status(404).json({ error: "Student not found in your school" });
      return;
    }

    const { data: courses, error: coursesError } = await supabaseAdmin
      .from("courses")
      .select("id")
      .eq("program_id", id);

    if (coursesError) {
      res.status(500).json({ error: coursesError.message });
      return;
    }

    for (const course of courses ?? []) {
      await enrollStudentInCourse(course.id as string, studentId);
    }

    res.json({ success: true, enrolledCourses: (courses ?? []).length });
  }
);

function mapProgram(p: Record<string, unknown>) {
  return {
    id: p.id,
    schoolId: p.school_id,
    name: p.name,
    code: p.code,
    description: p.description,
    level: p.level,
    isActive: p.is_active,
  };
}

export default router;
