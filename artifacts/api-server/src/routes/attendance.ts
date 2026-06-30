import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/courses/:courseId/attendance", requireAuth, async (req, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .select("*")
    .eq("course_id", courseId)
    .order("session_date", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const records = await Promise.all((data ?? []).map(enrichAttendance));
  res.json(records);
});

router.post("/courses/:courseId/attendance", requireAuth, async (req, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;
  const { studentId, sessionDate, status } = req.body;

  if (!studentId || !sessionDate || !status) {
    res.status(400).json({ error: "studentId, sessionDate, and status are required" });
    return;
  }

  const validStatuses = ["present", "absent", "late"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .upsert(
      {
        course_id: courseId,
        student_id: studentId,
        session_date: sessionDate,
        status,
      },
      { onConflict: "course_id,student_id,session_date" }
    )
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(await enrichAttendance(data));
});

async function enrichAttendance(a: Record<string, unknown>) {
  let studentName: string | null = null;

  if (a.student_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", a.student_id as string)
      .single();
    if (profile) {
      studentName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
    }
  }

  return {
    id: a.id,
    courseId: a.course_id,
    studentId: a.student_id,
    sessionDate: a.session_date,
    status: a.status,
    studentName,
  };
}

export default router;
