import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { mapExtension, recomputeSubmissionLateness } from "../lib/lateWork";
import { dispatchNotifications } from "../lib/notifyAudience";
import { logger } from "../lib/logger";

/**
 * Per-student assignment extensions (late-work-and-alerts.sql).
 *
 *   GET    /assignments/:id/extensions               teacher/admin: extensions + course roster
 *   PUT    /assignments/:id/extensions/:studentId    grant/replace { extendedDueAt, waivePenalty?, reason? }
 *   DELETE /assignments/:id/extensions/:studentId    revoke
 *
 * Only the course's teacher, an admin of the course's school, or
 * super_admin may manage them. Granting/revoking re-measures an existing
 * submission's lateness and re-applies (or removes) the late penalty on an
 * already-graded one.
 */
const router: IRouter = Router();

function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

async function loadManagedAssignment(
  req: AuthenticatedRequest,
  assignmentId: string
): Promise<{ ok: true; assignment: { id: string; title: string; course_id: string } } | { ok: false; status: number; error: string }> {
  if (req.userRole !== "teacher" && req.userRole !== "admin" && req.userRole !== "super_admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const { data: assignment } = await supabaseAdmin
    .from("assignments")
    .select("id, title, course_id, courses(school_id, teacher_id)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { ok: false, status: 404, error: "Assignment not found" };
  const course = (assignment as unknown as { courses: { school_id: string; teacher_id: string } | null }).courses;
  if (req.userRole === "teacher" && course?.teacher_id !== req.userId) {
    return { ok: false, status: 403, error: "You do not teach this course" };
  }
  if (req.userRole !== "super_admin" && course?.school_id !== req.schoolId) {
    return { ok: false, status: 404, error: "Assignment not found" };
  }
  return { ok: true, assignment: { id: assignment.id as string, title: assignment.title as string, course_id: assignment.course_id as string } };
}

router.get("/assignments/:id/extensions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const access = await loadManagedAssignment(req, param(req.params.id));
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { assignment } = access;

  const [{ data: extRows, error: extError }, { data: enrollments }] = await Promise.all([
    supabaseAdmin.from("assignment_extensions").select("*").eq("assignment_id", assignment.id),
    supabaseAdmin.from("course_enrollments").select("student_id").eq("course_id", assignment.course_id).eq("status", "active"),
  ]);

  const studentIds = (enrollments ?? []).map((e) => e.student_id as string);
  const { data: profiles } = studentIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", studentIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Student"]));

  res.json({
    // false until late-work-and-alerts.sql is applied, so the UI can say so.
    available: !extError,
    extensions: (extRows ?? []).map((r) => ({ ...mapExtension(r), studentName: nameById.get(r.student_id as string) ?? null })),
    students: studentIds
      .map((id) => ({ studentId: id, studentName: nameById.get(id) ?? "Student" }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName)),
  });
});

router.put("/assignments/:id/extensions/:studentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const access = await loadManagedAssignment(req, param(req.params.id));
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { assignment } = access;
  const studentId = param(req.params.studentId);
  const { extendedDueAt, waivePenalty, reason } = (req.body ?? {}) as {
    extendedDueAt?: string;
    waivePenalty?: boolean;
    reason?: string | null;
  };

  if (!extendedDueAt || isNaN(Date.parse(extendedDueAt))) {
    res.status(400).json({ error: "extendedDueAt must be a valid date" });
    return;
  }

  const { data: enrollment } = await supabaseAdmin
    .from("course_enrollments")
    .select("student_id")
    .eq("course_id", assignment.course_id)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();
  if (!enrollment) {
    res.status(400).json({ error: "That student is not enrolled in this course" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("assignment_extensions")
    .upsert(
      {
        assignment_id: assignment.id,
        student_id: studentId,
        extended_due_at: new Date(extendedDueAt).toISOString(),
        waive_penalty: waivePenalty === true,
        reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null,
        granted_by: req.userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,student_id" }
    )
    .select()
    .single();

  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to save extension" });
    return;
  }

  await recomputeSubmissionLateness(assignment.id, studentId).catch((err) =>
    logger.warn({ err }, "recompute lateness after extension failed")
  );

  const when = new Date(data.extended_due_at as string).toUTCString().replace(/:\d\d GMT$/, " UTC");
  dispatchNotifications({
    recipients: [{ userId: studentId, link: "/dashboard/student/assignments" }],
    type: "extension",
    category: "assignments",
    title: `Extension granted: ${assignment.title}`,
    body: `Your new due date is ${when}.${data.waive_penalty ? " The late penalty is waived." : ""}`,
    excludeUserId: req.userId ?? null,
    metadata: { assignmentId: assignment.id },
  });

  res.json(mapExtension(data));
});

router.delete("/assignments/:id/extensions/:studentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const access = await loadManagedAssignment(req, param(req.params.id));
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const studentId = param(req.params.studentId);
  const { error } = await supabaseAdmin
    .from("assignment_extensions")
    .delete()
    .eq("assignment_id", access.assignment.id)
    .eq("student_id", studentId);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  await recomputeSubmissionLateness(access.assignment.id, studentId).catch((err) =>
    logger.warn({ err }, "recompute lateness after extension removal failed")
  );
  res.sendStatus(204);
});

export default router;
