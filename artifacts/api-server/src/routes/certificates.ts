import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { computeCourseGrade } from "../lib/gradingEngine";
import {
  canIssue,
  getCertificateSettings,
  issueCertificate,
  mapCertificate,
  normalizeSignatories,
  DEFAULT_ACCENT,
} from "../lib/certificates";

const router: IRouter = Router();

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

/** The school an admin acts on: their own; super_admin may pass ?schoolId=. */
function adminSchoolId(req: AuthenticatedRequest): string | null {
  if (req.userRole === "admin") return req.schoolId ?? null;
  if (req.userRole === "super_admin") {
    const q = typeof req.query.schoolId === "string" ? req.query.schoolId : "";
    const b = typeof req.body?.schoolId === "string" ? req.body.schoolId : "";
    return q || b || req.schoolId || null;
  }
  return null;
}

function requireAdmin(req: AuthenticatedRequest, res: Response): string | null {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  const schoolId = adminSchoolId(req);
  if (!schoolId) {
    res.status(400).json({ error: "No school associated with this account" });
    return null;
  }
  return schoolId;
}

const isHttpsUrl = (v: unknown): v is string => typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v) && v.length <= 1000;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

router.get("/certificates/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireAdmin(req, res);
  if (!schoolId) return;
  try {
    const [settings, schoolRes] = await Promise.all([
      getCertificateSettings(schoolId),
      supabaseAdmin.from("schools").select("name, logo_url, primary_color, secondary_color").eq("id", schoolId).maybeSingle(),
    ]);
    res.json({
      ...settings,
      school: {
        name: (schoolRes.data?.name as string | null) ?? "",
        logoUrl: (schoolRes.data?.logo_url as string | null) ?? null,
        primaryColor: (schoolRes.data?.primary_color as string | null) ?? null,
        secondaryColor: (schoolRes.data?.secondary_color as string | null) ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load certificate settings" });
  }
});

router.put("/certificates/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireAdmin(req, res);
  if (!schoolId) return;

  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = String(b.title ?? "").trim();
  const bodyTemplate = String(b.bodyTemplate ?? "").trim();
  const accentColor = String(b.accentColor ?? DEFAULT_ACCENT).trim();
  const passPercent = Number(b.passPercent);
  const issueMode = b.issueMode === "auto" ? "auto" : b.issueMode === "approval" ? "approval" : null;

  if (!title || title.length > 120) { res.status(400).json({ error: "Title is required (max 120 characters)" }); return; }
  if (!bodyTemplate || bodyTemplate.length > 1000) { res.status(400).json({ error: "Certificate wording is required (max 1000 characters)" }); return; }
  if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) { res.status(400).json({ error: "Accent colour must be a hex colour like #c9a054" }); return; }
  if (!Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100) { res.status(400).json({ error: "Pass mark must be between 0 and 100" }); return; }
  if (!issueMode) { res.status(400).json({ error: "issueMode must be 'approval' or 'auto'" }); return; }
  if (b.logoUrl != null && b.logoUrl !== "" && !isHttpsUrl(b.logoUrl)) { res.status(400).json({ error: "Logo must be an uploaded image URL" }); return; }

  if (Array.isArray(b.signatories) && b.signatories.length > 2) { res.status(400).json({ error: "At most two signatories" }); return; }
  const signatories = normalizeSignatories(b.signatories);
  for (const s of signatories) {
    if (s.signatureUrl && !isHttpsUrl(s.signatureUrl)) { res.status(400).json({ error: "Signature must be an uploaded image URL" }); return; }
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from("certificate_settings")
      .select("configured_at")
      .eq("school_id", schoolId)
      .maybeSingle();
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("certificate_settings").upsert(
      {
        school_id: schoolId,
        enabled: b.enabled === true,
        logo_url: isHttpsUrl(b.logoUrl) ? b.logoUrl : null,
        title,
        body_template: bodyTemplate,
        signatories,
        accent_color: accentColor,
        issue_mode: issueMode,
        pass_percent: passPercent,
        teachers_can_issue: b.teachersCanIssue === true,
        configured_at: (existing?.configured_at as string | null) ?? now,
        updated_by: req.userId ?? null,
        updated_at: now,
      },
      { onConflict: "school_id" }
    );
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(await getCertificateSettings(schoolId));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to save certificate settings" });
  }
});

// ---------------------------------------------------------------------------
// Pending approval — students who meet the completion rule for a course but
// hold no valid certificate for it yet.
// ---------------------------------------------------------------------------

router.get("/certificates/pending", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireAdmin(req, res);
  if (!schoolId) return;
  try {
    const settings = await getCertificateSettings(schoolId);
    if (!canIssue(settings)) {
      res.json({ configured: settings.configured, enabled: settings.enabled, pending: [] });
      return;
    }

    const { data: courses } = await supabaseAdmin
      .from("courses")
      .select("id, title, code")
      .eq("school_id", schoolId)
      .limit(500);

    const pending: {
      studentId: string; studentName: string; studentEmail: string | null;
      courseId: string; courseTitle: string; courseCode: string | null; finalPercent: number | null;
    }[] = [];

    for (const course of courses ?? []) {
      if (pending.length >= 300) break;
      const courseId = course.id as string;
      const [assignRes, enrollRes, certRes] = await Promise.all([
        supabaseAdmin.from("assignments").select("id").eq("course_id", courseId).eq("is_published", true),
        supabaseAdmin.from("course_enrollments").select("student_id").eq("course_id", courseId).eq("status", "active"),
        supabaseAdmin.from("certificates").select("student_id").eq("course_id", courseId).eq("status", "valid"),
      ]);
      const assignmentIds = (assignRes.data ?? []).map((a) => a.id as string);
      if (assignmentIds.length === 0) continue;
      const certified = new Set((certRes.data ?? []).map((c) => c.student_id as string));
      const studentIds = (enrollRes.data ?? []).map((e) => e.student_id as string).filter((id) => !certified.has(id));
      if (studentIds.length === 0) continue;

      const { data: subs } = await supabaseAdmin
        .from("submissions")
        .select("assignment_id, student_id, grade")
        .in("assignment_id", assignmentIds)
        .in("student_id", studentIds)
        .not("grade", "is", null);
      const gradedCount = new Map<string, Set<string>>();
      for (const s of subs ?? []) {
        const sid = s.student_id as string;
        if (!gradedCount.has(sid)) gradedCount.set(sid, new Set());
        gradedCount.get(sid)!.add(s.assignment_id as string);
      }
      const candidates = studentIds.filter((sid) => (gradedCount.get(sid)?.size ?? 0) >= assignmentIds.length);
      if (candidates.length === 0) continue;

      const grades = await Promise.all(candidates.map((sid) => computeCourseGrade(courseId, sid).then((g) => [sid, g.overallPercent] as const)));
      const passing = grades.filter(([, pct]) => pct !== null && pct >= settings.passPercent);
      if (passing.length === 0) continue;

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email, role, school_id")
        .in("id", passing.map(([sid]) => sid));
      const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
      for (const [sid, pct] of passing) {
        const p = byId.get(sid);
        if (!p || p.school_id !== schoolId) continue;
        pending.push({
          studentId: sid,
          studentName: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Student",
          studentEmail: (p.email as string | null) ?? null,
          courseId,
          courseTitle: (course.title as string) ?? "",
          courseCode: (course.code as string | null) ?? null,
          finalPercent: pct,
        });
      }
    }

    res.json({ configured: true, enabled: true, pending });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load pending certificates" });
  }
});

// ---------------------------------------------------------------------------
// Issue (admin; teacher of the course only when the school allows it)
// ---------------------------------------------------------------------------

router.post("/certificates/issue", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { studentId, courseId, programId, approved } = (req.body ?? {}) as {
    studentId?: string; courseId?: string; programId?: string; approved?: boolean;
  };
  if (!studentId || (!courseId && !programId)) {
    res.status(400).json({ error: "studentId and a courseId or programId are required" });
    return;
  }

  let schoolId: string | null = null;
  if (req.userRole === "admin" || req.userRole === "super_admin") {
    schoolId = adminSchoolId(req);
  } else if (req.userRole === "teacher" && courseId && req.schoolId) {
    const settings = await getCertificateSettings(req.schoolId);
    const { data: course } = await supabaseAdmin.from("courses").select("teacher_id, school_id").eq("id", courseId).maybeSingle();
    if (!settings.teachersCanIssue || !course || course.teacher_id !== req.userId || course.school_id !== req.schoolId) {
      res.status(403).json({ error: "Only admins can issue certificates" });
      return;
    }
    schoolId = req.schoolId;
  } else {
    res.status(403).json({ error: "Only admins can issue certificates" });
    return;
  }
  if (!schoolId) { res.status(400).json({ error: "No school associated with this account" }); return; }

  try {
    let finalPercent: number | null = null;
    if (courseId) {
      finalPercent = (await computeCourseGrade(courseId, studentId)).overallPercent;
    }
    const result = await issueCertificate({
      schoolId,
      studentId,
      courseId: courseId ?? null,
      programId: programId ?? null,
      issuedBy: req.userId ?? null,
      method: approved === true ? "approved" : "manual",
      finalPercent,
    });
    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
    res.status(201).json(mapCertificate(result.certificate));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to issue certificate" });
  }
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

router.get("/certificates/mine", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("student_id", req.userId ?? "")
      .order("issued_at", { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json((data ?? []).map(mapCertificate));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load certificates" });
  }
});

router.get("/certificates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireAdmin(req, res);
  if (!schoolId) return;
  try {
    let query = supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("school_id", schoolId)
      .order("issued_at", { ascending: false })
      .limit(1000);
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status === "valid" || status === "revoked") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json((data ?? []).map(mapCertificate));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load certificates" });
  }
});

// ---------------------------------------------------------------------------
// Public verification — no login. Returns only what a verifier needs.
// ---------------------------------------------------------------------------

router.get("/certificates/verify/:code", async (req, res): Promise<void> => {
  const code = one(req.params.code).trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }
  try {
    const { data } = await supabaseAdmin
      .from("certificates")
      .select("verification_code, student_name, course_name, program_name, school_name, title, issued_at, status, revoked_at, logo_url, accent_color")
      .eq("verification_code", code)
      .maybeSingle();
    if (!data) { res.status(404).json({ error: "Certificate not found" }); return; }
    res.set("Cache-Control", "no-store");
    res.json({
      verificationCode: data.verification_code,
      valid: data.status === "valid",
      status: data.status,
      studentName: data.student_name,
      courseName: data.course_name ?? null,
      programName: data.program_name ?? null,
      schoolName: data.school_name,
      title: data.title,
      issuedAt: data.issued_at,
      revokedAt: data.revoked_at ?? null,
      logoUrl: data.logo_url ?? null,
      accentColor: data.accent_color ?? DEFAULT_ACCENT,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Verification failed" });
  }
});

// ---------------------------------------------------------------------------
// Single certificate (owner student, that school's admins, super_admin)
// ---------------------------------------------------------------------------

router.get("/certificates/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = one(req.params.id);
  try {
    const { data } = await supabaseAdmin.from("certificates").select("*").eq("id", id).maybeSingle();
    if (!data) { res.status(404).json({ error: "Certificate not found" }); return; }
    const isOwner = data.student_id === req.userId;
    const isSchoolAdmin = req.userRole === "admin" && req.schoolId === data.school_id;
    let isParent = false;
    if (!isOwner && !isSchoolAdmin && req.userRole === "parent") {
      const { data: link } = await supabaseAdmin
        .from("parent_student_links")
        .select("student_id")
        .eq("parent_id", req.userId ?? "")
        .eq("student_id", data.student_id as string)
        .maybeSingle();
      isParent = !!link;
    }
    if (!isOwner && !isSchoolAdmin && !isParent && req.userRole !== "super_admin") {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }
    res.json(mapCertificate(data));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load certificate" });
  }
});

router.post("/certificates/:id/revoke", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireAdmin(req, res);
  if (!schoolId) return;
  const id = one(req.params.id);
  const reason = String((req.body ?? {}).reason ?? "").trim().slice(0, 500) || null;
  try {
    const { data, error } = await supabaseAdmin
      .from("certificates")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: req.userId ?? null, revoke_reason: reason })
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("status", "valid")
      .select()
      .maybeSingle();
    if (error) { res.status(500).json({ error: error.message }); return; }
    if (!data) { res.status(404).json({ error: "Certificate not found or already revoked" }); return; }
    res.json(mapCertificate(data));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to revoke certificate" });
  }
});

export default router;
