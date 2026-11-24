import { randomInt } from "crypto";
import { supabaseAdmin } from "./supabase";
import { computeCourseGrade } from "./gradingEngine";
import { notifyUsers } from "./notifications";
import { logger } from "./logger";
import { getCourseProgress } from "./courseProgress";

// ---------------------------------------------------------------------------
// Certificates: per-school settings, eligibility, issuing.
//
// Nothing is ever issued for a school until it has enabled certificates AND
// saved its settings at least once (configured_at set) — the school confirms
// its own logo / wording before any student receives one.
// ---------------------------------------------------------------------------

export const DEFAULT_CERT_TITLE = "Certificate of Completion";
export const DEFAULT_CERT_BODY =
  "This is to certify that {studentName} has successfully completed {courseName} at {schoolName}, awarded on {date}.";
export const DEFAULT_ACCENT = "#c9a054";
export const DEFAULT_PASS_PERCENT = 70;

export interface Signatory {
  name: string;
  title: string;
  signatureUrl: string | null;
}

export interface CertificateSettings {
  schoolId: string;
  configured: boolean;
  enabled: boolean;
  logoUrl: string | null;
  title: string;
  bodyTemplate: string;
  signatories: Signatory[];
  accentColor: string;
  issueMode: "approval" | "auto";
  passPercent: number;
  teachersCanIssue: boolean;
  configuredAt: string | null;
  updatedAt: string | null;
}

export function normalizeSignatories(raw: unknown): Signatory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === "object")
    .slice(0, 2)
    .map((s) => {
      const o = s as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim().slice(0, 120),
        title: String(o.title ?? "").trim().slice(0, 120),
        signatureUrl: typeof o.signatureUrl === "string" && o.signatureUrl ? o.signatureUrl : null,
      };
    })
    .filter((s) => s.name || s.title || s.signatureUrl);
}

function mapSettings(schoolId: string, row: Record<string, unknown> | null, schoolLogo: string | null): CertificateSettings {
  return {
    schoolId,
    configured: !!row?.configured_at,
    enabled: row?.enabled === true,
    logoUrl: (row?.logo_url as string | null) ?? schoolLogo ?? null,
    title: (row?.title as string | null) || DEFAULT_CERT_TITLE,
    bodyTemplate: (row?.body_template as string | null) || DEFAULT_CERT_BODY,
    signatories: normalizeSignatories(row?.signatories),
    accentColor: (row?.accent_color as string | null) || DEFAULT_ACCENT,
    issueMode: row?.issue_mode === "auto" ? "auto" : "approval",
    passPercent: row?.pass_percent != null ? Number(row.pass_percent) : DEFAULT_PASS_PERCENT,
    teachersCanIssue: row?.teachers_can_issue === true,
    configuredAt: (row?.configured_at as string | null) ?? null,
    updatedAt: (row?.updated_at as string | null) ?? null,
  };
}

/** Settings for a school, with defaults filled in (school logo as default logo). */
export async function getCertificateSettings(schoolId: string): Promise<CertificateSettings> {
  const [settingsRes, schoolRes] = await Promise.all([
    supabaseAdmin.from("certificate_settings").select("*").eq("school_id", schoolId).maybeSingle(),
    supabaseAdmin.from("schools").select("logo_url").eq("id", schoolId).maybeSingle(),
  ]);
  return mapSettings(
    schoolId,
    (settingsRes.data as Record<string, unknown> | null) ?? null,
    (schoolRes.data?.logo_url as string | null) ?? null
  );
}

/** True when this school may issue certificates at all. */
export function canIssue(settings: CertificateSettings): boolean {
  return settings.enabled && settings.configured;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateVerificationCode(): string {
  const group = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `SQ-${group()}-${group()}-${group()}`;
}

export function formatCertificateDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Fills {studentName} {courseName} {programName} {schoolName} {date}. */
export function renderCertificateBody(
  template: string,
  values: { studentName: string; courseName: string; programName: string; schoolName: string; date: string }
): string {
  return template.replace(/\{(studentName|courseName|programName|schoolName|date)\}/g, (_m, key: keyof typeof values) => values[key] ?? "");
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface CourseEligibility {
  eligible: boolean;
  reason: string | null;
  finalPercent: number | null;
  publishedAssignments: number;
  gradedAssignments: number;
}

/**
 * "Completed" for certificate purposes: every published assignment of the
 * course has a graded submission from the student, and the student's course
 * grade (computeCourseGrade — the app's single grade formula) is at or above
 * the school's pass mark.
 *
 * When the course has modules, every published module item must also be
 * complete (lib/courseProgress).
 */
export async function checkCourseEligibility(
  studentId: string,
  courseId: string,
  passPercent: number
): Promise<CourseEligibility> {
  const { data: assignments } = await supabaseAdmin
    .from("assignments")
    .select("id")
    .eq("course_id", courseId)
    .eq("is_published", true);
  const assignmentIds = (assignments ?? []).map((a) => a.id as string);
  if (assignmentIds.length === 0) {
    return { eligible: false, reason: "The course has no published assignments", finalPercent: null, publishedAssignments: 0, gradedAssignments: 0 };
  }

  const { data: subs } = await supabaseAdmin
    .from("submissions")
    .select("assignment_id, grade")
    .eq("student_id", studentId)
    .in("assignment_id", assignmentIds);
  const graded = new Set(
    (subs ?? []).filter((s) => s.grade !== null && s.grade !== undefined).map((s) => s.assignment_id as string)
  );
  const gradedCount = assignmentIds.filter((id) => graded.has(id)).length;
  if (gradedCount < assignmentIds.length) {
    return {
      eligible: false,
      reason: `${assignmentIds.length - gradedCount} assignment(s) not yet submitted and graded`,
      finalPercent: null,
      publishedAssignments: assignmentIds.length,
      gradedAssignments: gradedCount,
    };
  }

  const grade = await computeCourseGrade(courseId, studentId);
  const pct = grade.overallPercent;
  if (pct === null || pct < passPercent) {
    return {
      eligible: false,
      reason: `Course grade ${pct ?? "—"}% is below the ${passPercent}% pass mark`,
      finalPercent: pct,
      publishedAssignments: assignmentIds.length,
      gradedAssignments: gradedCount,
    };
  }
  // Course modules (course-modules.sql): when the course has module items,
  // every one of them must be done too. Courses without modules, or a
  // database without that migration, skip this check.
  try {
    const progress = await getCourseProgress(studentId, courseId);
    if (progress.totalItems > 0 && progress.completedItems < progress.totalItems) {
      return {
        eligible: false,
        reason: `Course content ${Math.round(progress.percent)}% complete`,
        finalPercent: pct,
        publishedAssignments: assignmentIds.length,
        gradedAssignments: gradedCount,
      };
    }
  } catch {
    // modules not available: grade-based completion only
  }
  return { eligible: true, reason: null, finalPercent: pct, publishedAssignments: assignmentIds.length, gradedAssignments: gradedCount };
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

export interface IssueParams {
  schoolId: string;
  studentId: string;
  courseId?: string | null;
  programId?: string | null;
  issuedBy: string | null;
  method: "manual" | "approved" | "auto";
  finalPercent?: number | null;
}

export type IssueResult =
  | { ok: true; certificate: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Issues one certificate. Validates that student/course/program all belong
 * to `schoolId` (never trust ids from the client), refuses when the school
 * hasn't set certificates up, and refuses a duplicate valid certificate.
 */
export async function issueCertificate(params: IssueParams): Promise<IssueResult> {
  const { schoolId, studentId, issuedBy, method } = params;
  const courseId = params.courseId || null;
  const programId = courseId ? null : params.programId || null;
  if (!courseId && !programId) return { ok: false, status: 400, error: "courseId or programId is required" };

  const settings = await getCertificateSettings(schoolId);
  if (!canIssue(settings)) {
    return { ok: false, status: 409, error: "Certificates are not set up for this school yet. An admin must enable and save the certificate settings first." };
  }

  const [studentRes, schoolRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, first_name, last_name, role, school_id").eq("id", studentId).maybeSingle(),
    supabaseAdmin.from("schools").select("name").eq("id", schoolId).maybeSingle(),
  ]);
  const student = studentRes.data;
  if (!student || student.school_id !== schoolId || (student.role !== "student" && student.role !== "staff")) {
    return { ok: false, status: 404, error: "Student not found in this school" };
  }

  let courseName = "";
  let programName = "";
  if (courseId) {
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("id, title, school_id, program_id, programs:program_id (name)")
      .eq("id", courseId)
      .maybeSingle();
    if (!course || course.school_id !== schoolId) return { ok: false, status: 404, error: "Course not found in this school" };
    courseName = (course.title as string) ?? "";
    const prog = course.programs as unknown as { name: string | null } | { name: string | null }[] | null;
    programName = (Array.isArray(prog) ? prog[0]?.name : prog?.name) ?? "";
    const { data: enrollment } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", courseId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!enrollment) return { ok: false, status: 400, error: "The student is not enrolled in this course" };
  } else {
    const { data: program } = await supabaseAdmin.from("programs").select("id, name, school_id").eq("id", programId!).maybeSingle();
    if (!program || program.school_id !== schoolId) return { ok: false, status: 404, error: "Program not found in this school" };
    programName = (program.name as string) ?? "";
  }

  let existingQuery = supabaseAdmin
    .from("certificates")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "valid");
  existingQuery = courseId ? existingQuery.eq("course_id", courseId) : existingQuery.eq("program_id", programId!).is("course_id", null);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) return { ok: false, status: 409, error: "This student already has a valid certificate for it" };

  const studentName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || "Student";
  const schoolName = (schoolRes.data?.name as string | null) ?? "";
  const now = new Date();
  const body = renderCertificateBody(settings.bodyTemplate, {
    studentName,
    // For a program certificate, {courseName} reads as the program's name so
    // the default wording ("…has successfully completed {courseName}…") works.
    courseName: courseId ? courseName : programName,
    programName,
    schoolName,
    date: formatCertificateDate(now),
  });

  let lastError = "Failed to issue certificate";
  // Retry on the (astronomically unlikely) verification-code collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("certificates")
      .insert({
        school_id: schoolId,
        student_id: studentId,
        course_id: courseId,
        program_id: courseId ? null : programId,
        verification_code: generateVerificationCode(),
        student_name: studentName,
        course_name: courseId ? courseName : null,
        program_name: programName || null,
        school_name: schoolName,
        title: settings.title,
        body,
        logo_url: settings.logoUrl,
        accent_color: settings.accentColor,
        signatories: settings.signatories,
        final_percent: params.finalPercent ?? null,
        issue_method: method,
        issued_by: issuedBy,
        issued_at: now.toISOString(),
        status: "valid",
      })
      .select()
      .single();
    if (!error && data) {
      notifyUsers({
        userIds: [studentId],
        type: "certificate_issued",
        category: "grades",
        title: "You've earned a certificate",
        body: `Your ${settings.title.toLowerCase()} for ${courseId ? courseName : programName} is ready to view and download.`,
        link: "/dashboard/student/certificates",
      }).catch((e) => logger.warn({ err: e }, "[certificates] notify failed"));
      return { ok: true, certificate: data };
    }
    lastError = error?.message ?? lastError;
    // 23505 = unique violation. If it's the one-valid-per-course index, stop.
    if (error?.code === "23505" && !/verification_code/.test(error.message)) {
      return { ok: false, status: 409, error: "This student already has a valid certificate for it" };
    }
    if (error?.code !== "23505") break;
  }
  return { ok: false, status: 500, error: lastError };
}

/**
 * Auto-issue hook. Call this whenever a student may have just completed a
 * course (fire-and-forget; never throws). It only does anything when the
 * course's school has certificates enabled + configured with issue mode
 * "auto", the student has no valid certificate for the course yet, and
 * checkCourseEligibility passes.
 *
 * Currently called from gradeSubmission() (lib/gradingEngine.ts) after every
 * grade, since "last assignment graded" is when completion happens today.
 * Also called when a student marks a lesson complete (routes/course-modules.ts),
 * since finishing the last lesson can be what completes the course.
 */
export async function maybeIssueCertificate(studentId: string, courseId: string): Promise<void> {
  try {
    const { data: course } = await supabaseAdmin.from("courses").select("school_id").eq("id", courseId).maybeSingle();
    const schoolId = course?.school_id as string | null | undefined;
    if (!schoolId) return;
    const settings = await getCertificateSettings(schoolId);
    if (!canIssue(settings) || settings.issueMode !== "auto") return;

    const { data: existing } = await supabaseAdmin
      .from("certificates")
      .select("id")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("status", "valid")
      .maybeSingle();
    if (existing) return;

    const elig = await checkCourseEligibility(studentId, courseId, settings.passPercent);
    if (!elig.eligible) return;

    const result = await issueCertificate({
      schoolId,
      studentId,
      courseId,
      issuedBy: null,
      method: "auto",
      finalPercent: elig.finalPercent,
    });
    if (!result.ok && result.status !== 409) {
      logger.warn({ error: result.error, studentId, courseId }, "[certificates] auto-issue failed");
    }
  } catch (err) {
    logger.warn({ err, studentId, courseId }, "[certificates] maybeIssueCertificate error");
  }
}

/** API shape for a certificate row (camelCase). */
export function mapCertificate(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    schoolId: row.school_id as string,
    studentId: row.student_id as string,
    courseId: (row.course_id as string | null) ?? null,
    programId: (row.program_id as string | null) ?? null,
    verificationCode: row.verification_code as string,
    studentName: row.student_name as string,
    courseName: (row.course_name as string | null) ?? null,
    programName: (row.program_name as string | null) ?? null,
    schoolName: row.school_name as string,
    title: row.title as string,
    body: row.body as string,
    logoUrl: (row.logo_url as string | null) ?? null,
    accentColor: (row.accent_color as string | null) ?? DEFAULT_ACCENT,
    signatories: normalizeSignatories(row.signatories),
    finalPercent: row.final_percent != null ? Number(row.final_percent) : null,
    issueMethod: row.issue_method as string,
    issuedAt: row.issued_at as string,
    status: row.status as "valid" | "revoked",
    revokedAt: (row.revoked_at as string | null) ?? null,
    revokeReason: (row.revoke_reason as string | null) ?? null,
  };
}
