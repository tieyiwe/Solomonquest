import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// Get my courses (teacher = teaching, student = enrolled)
router.get("/courses/my", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  const userId = req.userId;

  if (role === "teacher") {
    const { data, error } = await supabaseAdmin
      .from("courses")
      .select("*")
      .eq("teacher_id", userId ?? "");

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const courses = await Promise.all((data ?? []).map(enrichCourse));
    res.json(courses);
    return;
  }

  // Student: get enrolled courses
  const { data: enrollments, error: enrollErr } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", userId ?? "")
    .eq("status", "active");

  if (enrollErr) {
    res.status(500).json({ error: enrollErr.message });
    return;
  }

  const courseIds = (enrollments ?? []).map((e: Record<string, unknown>) => e.course_id as string);

  if (courseIds.length === 0) {
    res.json([]);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("*")
    .in("id", courseIds);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const courses = await Promise.all((data ?? []).map(enrichCourse));
  res.json(courses);
});

// List courses
router.get("/courses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  let query = supabaseAdmin
    .from("courses")
    .select("*")
    .eq("school_id", req.schoolId ?? "");

  if (req.query.programId) {
    query = query.eq("program_id", req.query.programId as string);
  }
  if (req.query.published === "true") {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query.order("title");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const courses = await Promise.all((data ?? []).map(enrichCourse));
  res.json(courses);
});

// Create course
router.post("/courses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { title, programId, teacherId, code, term, description } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("courses")
    .insert({
      school_id: req.schoolId,
      title,
      program_id: programId ?? null,
      teacher_id: teacherId ?? null,
      code: code ?? null,
      term: term ?? null,
      description: description ?? null,
      is_published: false,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(await enrichCourse(data));
});

// Get single course
router.get("/courses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json(await enrichCourse(data));
});

// Update course
router.patch("/courses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { title, programId, teacherId, code, term, description, isPublished } = req.body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (programId !== undefined) updates.program_id = programId;
  if (teacherId !== undefined) updates.teacher_id = teacherId;
  if (code !== undefined) updates.code = code;
  if (term !== undefined) updates.term = term;
  if (description !== undefined) updates.description = description;
  if (isPublished !== undefined) updates.is_published = isPublished;

  const { data, error } = await supabaseAdmin
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json(await enrichCourse(data));
});

// Delete course
router.delete("/courses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { error } = await supabaseAdmin.from("courses").delete().eq("id", id);

  if (error) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.sendStatus(204);
});

// Get course students
router.get("/courses/:id/students", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("course_enrollments")
    .select("student_id")
    .eq("course_id", id)
    .eq("status", "active");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const studentIds = (data ?? []).map((e: Record<string, unknown>) => e.student_id as string);

  if (studentIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: profiles, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .in("id", studentIds);

  if (profErr) {
    res.status(500).json({ error: profErr.message });
    return;
  }

  res.json((profiles ?? []).map((p: Record<string, unknown>) => ({
    id: p.id,
    schoolId: p.school_id,
    role: p.role,
    firstName: p.first_name,
    lastName: p.last_name,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    email: null,
  })));
});

// Enroll student
router.post("/courses/:id/enroll", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { studentId } = req.body;

  if (!studentId) {
    res.status(400).json({ error: "studentId is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("course_enrollments")
    .insert({ course_id: id, student_id: studentId, status: "active" })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json({
    courseId: data.course_id,
    studentId: data.student_id,
    status: data.status,
  });
});

// Update live class settings
router.put("/courses/:id/live-settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (role !== "admin" && role !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { is_live, class_date, class_end_time } = req.body;

  const updates: Record<string, unknown> = {};
  if (is_live !== undefined) updates.is_live = is_live;
  if (class_date !== undefined) updates.class_date = class_date;
  if (class_end_time !== undefined) updates.class_end_time = class_end_time;

  const { data, error } = await supabaseAdmin
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  // Send notifications to enrolled students if going live with a date
  if (is_live === true && class_date) {
    const { data: enrollments } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", id)
      .eq("status", "active");

    if (enrollments && enrollments.length > 0) {
      const notifications = (enrollments as Record<string, unknown>[]).map((e) => ({
        user_id: e.student_id,
        course_id: id,
        message: `Live class scheduled for ${class_date}`,
        type: "live_class",
      }));

      await supabaseAdmin.from("notifications").insert(notifications);
    }
  }

  res.json(await enrichCourse(data as Record<string, unknown>));
});

async function enrichCourse(c: Record<string, unknown>) {
  let teacherName: string | null = null;
  let studentCount: number | null = null;

  if (c.teacher_id) {
    const { data: teacher } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", c.teacher_id as string)
      .single();
    if (teacher) {
      teacherName = [teacher.first_name, teacher.last_name].filter(Boolean).join(" ") || null;
    }
  }

  const { count } = await supabaseAdmin
    .from("course_enrollments")
    .select("*", { count: "exact", head: true })
    .eq("course_id", c.id as string)
    .eq("status", "active");

  studentCount = count ?? 0;

  return {
    id: c.id,
    schoolId: c.school_id,
    programId: c.program_id,
    teacherId: c.teacher_id,
    title: c.title,
    code: c.code,
    term: c.term,
    description: c.description,
    isPublished: c.is_published,
    teacherName,
    studentCount,
  };
}

export default router;
