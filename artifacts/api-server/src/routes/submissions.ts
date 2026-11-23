import { Router, type IRouter } from "express";
import multer from "multer";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { gradeSubmission } from "../lib/gradingEngine";
import { scanFile } from "../lib/fileScan";
import { logger } from "../lib/logger";
import {
  getExtension,
  submissionRefusal,
  hasLateColumns,
  effectiveDueDate,
  minutesLate,
  submissionLateFields,
  getExtensionsForAssignments,
} from "../lib/lateWork";

const router: IRouter = Router();

const SUBMISSIONS_BUCKET = "submission-files";
const MAX_SUBMISSION_FILE_BYTES = 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SUBMISSION_FILE_BYTES } });

let bucketReady: Promise<void> | null = null;
/** Lazily creates the submission-files bucket (same pattern as chat
 *  attachments), so no manual storage setup is needed. */
function ensureSubmissionsBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = supabaseAdmin.storage
      .createBucket(SUBMISSIONS_BUCKET, { public: true, fileSizeLimit: MAX_SUBMISSION_FILE_BYTES })
      .then(() => undefined)
      .catch((err) => {
        if (!String(err?.message ?? err).toLowerCase().includes("already exists")) {
          logger.error({ err }, "Failed to create submission-files bucket");
        }
      });
  }
  return bucketReady;
}

/** The caller may hand in work for this assignment: a student, actively
 *  enrolled in its course, the assignment published, and not already graded. */
async function assertStudentCanSubmit(
  req: AuthenticatedRequest,
  assignmentId: string
): Promise<{ ok: true; lateFields: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  if (req.userRole !== "student") {
    return { ok: false, status: 403, error: "Only students can submit assignments" };
  }

  // "*" so the late-policy columns come along once late-work-and-alerts.sql
  // is applied (and are simply absent before).
  const { data: assignment } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return { ok: false, status: 404, error: "Assignment not found" };
  if (!assignment.is_published) return { ok: false, status: 403, error: "This assignment is not yet published" };

  const { data: enrollment } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("course_id", assignment.course_id as string)
    .eq("student_id", req.userId ?? "")
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment) return { ok: false, status: 403, error: "You are not enrolled in this course" };

  // The upsert below overwrote content (and reset status to "submitted") on
  // an already-graded submission while keeping its grade, so a student
  // could swap in different work after seeing their mark and the grade
  // would silently attach to it.
  const { data: prior } = await supabaseAdmin
    .from("submissions")
    .select("id, grade, graded_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", req.userId ?? "")
    .maybeSingle();
  if (prior && (prior.grade != null || prior.graded_at)) {
    return { ok: false, status: 409, error: "This submission has already been graded and can no longer be changed" };
  }

  // Late-work rules: refuse after the (extension-adjusted) cutoff, or after
  // the due date when the assignment doesn't accept late work. Otherwise
  // record how late this hand-in is against the student's effective due date.
  let lateFields: Record<string, unknown> = {};
  if (hasLateColumns(assignment)) {
    const ext = await getExtension(assignmentId, req.userId ?? "");
    const refusal = submissionRefusal(assignment, ext);
    if (refusal) return { ok: false, status: 403, error: refusal };
    const mins = minutesLate(new Date(), effectiveDueDate(assignment.due_date as string | null, ext));
    lateFields = { submitted_late: mins > 0, minutes_late: mins };
  }

  return { ok: true, lateFields };
}

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
  const allowed = await assertStudentCanSubmit(req, assignmentId);
  if (!allowed.ok) {
    res.status(allowed.status).json({ error: allowed.error });
    return;
  }

  const { content, fileUrl, fileName } = req.body as { content?: string; fileUrl?: string | null; fileName?: string | null };

  // Only accept file URLs that the upload route below produced (our own
  // bucket), so a submission can't point the teacher at an arbitrary link
  // dressed up as an attached file. Pasted links still go in `content`.
  let storedFileUrl: string | null = null;
  if (typeof fileUrl === "string" && fileUrl) {
    const { data: bucketUrl } = supabaseAdmin.storage.from(SUBMISSIONS_BUCKET).getPublicUrl(`${assignmentId}/${req.userId}/`);
    if (!fileUrl.startsWith(bucketUrl.publicUrl)) {
      res.status(400).json({ error: "fileUrl must come from the submission upload endpoint" });
      return;
    }
    storedFileUrl = fileUrl;
  }

  // Upsert submission
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .upsert(
      {
        assignment_id: assignmentId,
        student_id: req.userId,
        content: content ?? null,
        // Only touch the file columns when the client sent a file, so plain
        // text/link submissions keep working even before submission-files.sql
        // has been applied.
        ...(fileUrl !== undefined
          ? { file_url: storedFileUrl, file_name: storedFileUrl && typeof fileName === "string" ? fileName.slice(0, 255) : null }
          : {}),
        ...allowed.lateFields,
        status: "submitted",
        // The column default only fires on insert — a resubmission kept the
        // first attempt's timestamp, so late resubmits looked on time.
        submitted_at: new Date().toISOString(),
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

// Upload a file for a submission. Goes through the API (not client-direct
// to storage) so it can be virus-scanned first, like chat attachments.
// Returns the stored file's URL; the client then submits with
// { content, fileUrl, fileName }.
router.post(
  "/assignments/:assignmentId/submissions/upload",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const assignmentId = Array.isArray(req.params.assignmentId)
      ? req.params.assignmentId[0]
      : req.params.assignmentId;

    const allowed = await assertStudentCanSubmit(req, assignmentId);
    if (!allowed.ok) {
      res.status(allowed.status).json({ error: allowed.error });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const scan = await scanFile(req.file.buffer, req.file.originalname);
    if (!scan.allowed) {
      res.status(422).json({ error: scan.reason ?? "This file could not be uploaded.", flagged: true });
      return;
    }

    await ensureSubmissionsBucket();

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${assignmentId}/${req.userId}/${Date.now()}-${safeName}`;
    // Public bucket + client-claimed mimetype: never serve active content
    // (HTML/SVG/XML/JS) inline from it.
    const ACTIVE_CONTENT = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;
    const contentType = ACTIVE_CONTENT.test(req.file.mimetype) ? "application/octet-stream" : req.file.mimetype;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(SUBMISSIONS_BUCKET)
      .upload(path, req.file.buffer, { contentType, upsert: false });
    if (uploadError) {
      res.status(500).json({ error: uploadError.message });
      return;
    }

    const { data: publicUrl } = supabaseAdmin.storage.from(SUBMISSIONS_BUCKET).getPublicUrl(path);
    res.status(201).json({
      fileUrl: publicUrl.publicUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
    });
  }
);

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
    submittedAt: s.submitted_at ?? null,
    fileUrl: s.file_url ?? null,
    fileName: s.file_name ?? null,
    status: s.status,
    ...submissionLateFields(s),
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

  const assignmentIds = Array.from(new Set(rows.map((s) => s.assignment_id as string).filter(Boolean)));
  const extensions = await getExtensionsForAssignments(assignmentIds);

  return rows.map((s) => ({
    id: s.id,
    assignmentId: s.assignment_id,
    studentId: s.student_id,
    content: s.content,
    grade: s.grade,
    rubricScores: s.rubric_scores ?? null,
    feedback: s.feedback ?? null,
    gradedAt: s.graded_at ?? null,
    submittedAt: s.submitted_at ?? null,
    fileUrl: s.file_url ?? null,
    fileName: s.file_name ?? null,
    status: s.status,
    ...submissionLateFields(s),
    extension: extensions.get(`${s.assignment_id}:${s.student_id}`) ?? null,
    studentName: s.student_id ? nameById.get(s.student_id as string) ?? null : null,
  }));
}

export default router;
