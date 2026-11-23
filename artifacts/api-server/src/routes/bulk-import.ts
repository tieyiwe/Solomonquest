import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createInvitation } from "./invitations";

// ---------------------------------------------------------------------------
// CSV bulk import (Admin → Bulk import). The browser parses the CSV and
// sends rows as JSON; every row is (re)validated here against the admin's
// OWN school — /validate returns the per-row preview, /commit re-runs the
// same validation and only writes rows that pass.
//
//   students → one invitation per row through the existing invitation flow
//              (createInvitation: invitation row + emailed link). No auth
//              users or passwords are created here.
//   courses  → course rows, like POST /courses.
// ---------------------------------------------------------------------------

const router: IRouter = Router();
const MAX_ROWS = 500;
const EMAIL_RX = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const s = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const key = (v: string) => v.trim().toLowerCase();

function guard(req: AuthenticatedRequest, res: Response): string | null {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  if (!req.schoolId) {
    res.status(400).json({ error: "No school associated with this account" });
    return null;
  }
  return req.schoolId;
}

function rowsOf(req: AuthenticatedRequest, res: Response): Record<string, unknown>[] | null {
  const rows = (req.body ?? {}).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "rows (a non-empty array) is required" });
    return null;
  }
  if (rows.length > MAX_ROWS) {
    res.status(400).json({ error: `A single import is capped at ${MAX_ROWS} rows. Split the file into smaller batches.` });
    return null;
  }
  return rows.map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}));
}

/** "a; b | c" → ["a","b","c"] */
function splitList(v: string): string[] {
  return v.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
}

async function programLookup(schoolId: string) {
  const { data } = await supabaseAdmin.from("programs").select("id, name, code").eq("school_id", schoolId);
  const map = new Map<string, { id: string; name: string }>();
  for (const p of data ?? []) {
    const v = { id: p.id as string, name: p.name as string };
    if (p.name) map.set(key(p.name as string), v);
    if (p.code) map.set(key(p.code as string), v);
  }
  return map;
}

// ─── Students ───────────────────────────────────────────────────────────────

interface StudentRowResult {
  row: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  program: string;
  courses: string;
  programId: string | null;
  programName: string | null;
  courseIds: string[];
  courseTitles: string[];
  errors: string[];
  warnings: string[];
}

async function validateStudents(schoolId: string, rows: Record<string, unknown>[]): Promise<StudentRowResult[]> {
  const programs = await programLookup(schoolId);
  const { data: courseRows } = await supabaseAdmin.from("courses").select("id, title, code").eq("school_id", schoolId);
  const courseByKey = new Map<string, { id: string; title: string }[]>();
  for (const c of courseRows ?? []) {
    const v = { id: c.id as string, title: c.title as string };
    for (const k of [c.code, c.title]) {
      if (!k) continue;
      const kk = key(k as string);
      courseByKey.set(kk, [...(courseByKey.get(kk) ?? []), v]);
    }
  }

  const emails = Array.from(new Set(rows.map((r) => key(s(r.email, 320))).filter((e) => EMAIL_RX.test(e))));
  const existingProfiles = new Map<string, { school_id: string | null }>();
  const pendingInvites = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200);
    const [pRes, iRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("email, school_id").in("email", chunk),
      supabaseAdmin
        .from("invitations")
        .select("email, expires_at")
        .eq("school_id", schoolId)
        .eq("status", "pending")
        .in("email", chunk),
    ]);
    for (const p of pRes.data ?? []) if (p.email) existingProfiles.set(key(p.email as string), { school_id: (p.school_id as string | null) ?? null });
    const now = Date.now();
    for (const inv of iRes.data ?? []) {
      if (inv.email && (!inv.expires_at || Date.parse(inv.expires_at as string) > now)) pendingInvites.add(key(inv.email as string));
    }
  }

  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let firstName = s(r.firstName ?? r.first_name, 100);
    let lastName = s(r.lastName ?? r.last_name, 100);
    const name = s(r.name, 200) || `${firstName} ${lastName}`.trim();
    if (!firstName && !lastName && name) {
      const parts = name.split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    const email = key(s(r.email, 320));
    const program = s(r.program, 200);
    const courses = s(r.courses, 2000);

    if (!name) errors.push("Name is required");
    if (!email) errors.push("Email is required");
    else if (!EMAIL_RX.test(email)) errors.push(`"${email}" is not a valid email`);
    else {
      if (seen.has(email)) errors.push(`Duplicate of row ${seen.get(email)} in this file`);
      else seen.set(email, i + 2);
      const existing = existingProfiles.get(email);
      if (existing && existing.school_id === schoolId) errors.push("Already a member of your school");
      else if (existing) warnings.push("Has a SolomonQuest account at another school; accepting moves them to yours");
      if (pendingInvites.has(email)) errors.push("Already has a pending invitation");
    }

    let programId: string | null = null;
    let programName: string | null = null;
    if (program) {
      const p = programs.get(key(program));
      if (!p) errors.push(`Unknown program "${program}"`);
      else { programId = p.id; programName = p.name; }
    }

    const courseIds: string[] = [];
    const courseTitles: string[] = [];
    for (const c of splitList(courses)) {
      const matches = courseByKey.get(key(c)) ?? [];
      if (matches.length === 0) errors.push(`Unknown course "${c}"`);
      else if (matches.length > 1) errors.push(`"${c}" matches ${matches.length} courses; use the course code`);
      else if (!courseIds.includes(matches[0].id)) { courseIds.push(matches[0].id); courseTitles.push(matches[0].title); }
    }
    if (!programId && courseIds.length === 0 && errors.length === 0) {
      warnings.push("No program or course: they will join the school without any enrolments");
    }

    return { row: i + 2, name, firstName, lastName, email, program, courses, programId, programName, courseIds, courseTitles, errors, warnings };
  });
}

router.post("/bulk-import/:kind/validate", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = guard(req, res);
  if (!schoolId) return;
  const rows = rowsOf(req, res);
  if (!rows) return;
  try {
    const kind = one(req.params.kind);
    if (kind === "students") { res.json({ rows: await validateStudents(schoolId, rows) }); return; }
    if (kind === "courses") { res.json({ rows: await validateCourses(schoolId, rows) }); return; }
    res.status(404).json({ error: "Unknown import type" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Validation failed" });
  }
});

router.post("/bulk-import/:kind/commit", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = guard(req, res);
  if (!schoolId) return;
  const rows = rowsOf(req, res);
  if (!rows) return;
  const kind = one(req.params.kind);
  try {
    const results: { row: number; label: string; success: boolean; skipped?: boolean; error?: string; id?: string }[] = [];

    if (kind === "students") {
      const validated = await validateStudents(schoolId, rows);
      // Sequential on purpose: each row sends an email (see /invitations/bulk).
      for (const v of validated) {
        if (v.errors.length > 0) { results.push({ row: v.row, label: v.email || v.name, success: false, skipped: true, error: v.errors.join("; ") }); continue; }
        const r = await createInvitation({
          email: v.email,
          role: "student",
          programId: v.programId,
          schoolId,
          invitedBy: req.userId ?? "",
          firstName: v.firstName || null,
          lastName: v.lastName || null,
          courseIds: v.courseIds,
          programOptional: true,
        });
        results.push(r.ok
          ? { row: v.row, label: v.email, success: true, id: r.invitation.id as string }
          : { row: v.row, label: v.email, success: false, error: r.error });
      }
    } else if (kind === "courses") {
      const validated = await validateCourses(schoolId, rows);
      for (const v of validated) {
        if (v.errors.length > 0) { results.push({ row: v.row, label: v.code || v.title, success: false, skipped: true, error: v.errors.join("; ") }); continue; }
        const { data, error } = await supabaseAdmin
          .from("courses")
          .insert({
            school_id: schoolId,
            title: v.title,
            code: v.code || null,
            description: v.description || null,
            teacher_id: v.teacherId,
            program_id: v.programId,
            term: v.termName ?? (v.term || null),
            term_id: v.termId,
            term_start_date: v.termStartDate,
            term_end_date: v.termEndDate,
            is_published: false,
            created_by: req.userId ?? null,
          })
          .select("id")
          .single();
        if (error || !data) { results.push({ row: v.row, label: v.code || v.title, success: false, error: error?.message ?? "Insert failed" }); continue; }
        supabaseAdmin
          .from("course_audit_log")
          .insert({ course_id: data.id, action: "created", performed_by: req.userId ?? null, new_teacher_id: v.teacherId })
          .then(({ error: logError }) => { if (logError) console.warn("[bulk-import] audit log error:", logError); });
        results.push({ row: v.row, label: v.code || v.title, success: true, id: data.id as string });
      }
    } else {
      res.status(404).json({ error: "Unknown import type" });
      return;
    }

    const succeeded = results.filter((r) => r.success).length;
    const skipped = results.filter((r) => r.skipped).length;
    res.json({ total: results.length, succeeded, failed: results.length - succeeded - skipped, skipped, results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Import failed" });
  }
});

// ─── Courses ────────────────────────────────────────────────────────────────

interface CourseRowResult {
  row: number;
  title: string;
  code: string;
  description: string;
  teacherEmail: string;
  program: string;
  term: string;
  teacherId: string | null;
  teacherName: string | null;
  programId: string | null;
  programName: string | null;
  termId: string | null;
  termName: string | null;
  termStartDate: string | null;
  termEndDate: string | null;
  errors: string[];
  warnings: string[];
}

async function validateCourses(schoolId: string, rows: Record<string, unknown>[]): Promise<CourseRowResult[]> {
  const [programs, coursesRes, teachersRes, termsRes] = await Promise.all([
    programLookup(schoolId),
    supabaseAdmin.from("courses").select("title, code").eq("school_id", schoolId),
    supabaseAdmin.from("profiles").select("id, email, first_name, last_name").eq("school_id", schoolId).eq("role", "teacher"),
    supabaseAdmin.from("terms").select("id, name, start_date, end_date").eq("school_id", schoolId),
  ]);
  const existingCodes = new Set((coursesRes.data ?? []).map((c) => (c.code ? key(c.code as string) : "")).filter(Boolean));
  const existingTitles = new Set((coursesRes.data ?? []).map((c) => key((c.title as string) ?? "")));
  const teachers = new Map(
    (teachersRes.data ?? []).filter((t) => t.email).map((t) => [key(t.email as string), { id: t.id as string, name: `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() }])
  );
  const terms = new Map(
    (termsRes.data ?? []).map((t) => [key(t.name as string), { id: t.id as string, name: t.name as string, start: (t.start_date as string | null) ?? null, end: (t.end_date as string | null) ?? null }])
  );

  const seenCodes = new Map<string, number>();
  return rows.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const title = s(r.title, 200);
    const code = s(r.code, 50);
    const description = s(r.description, 5000);
    const teacherEmail = key(s(r.teacherEmail ?? r.teacher_email, 320));
    const program = s(r.program, 200);
    const term = s(r.term, 120);

    if (!title) errors.push("Title is required");
    if (code) {
      const k = key(code);
      if (existingCodes.has(k)) errors.push(`A course with code "${code}" already exists`);
      if (seenCodes.has(k)) errors.push(`Duplicate code; also on row ${seenCodes.get(k)}`);
      else seenCodes.set(k, i + 2);
    } else if (title && existingTitles.has(key(title))) {
      warnings.push("A course with this title already exists");
    }

    let teacherId: string | null = null;
    let teacherName: string | null = null;
    if (teacherEmail) {
      if (!EMAIL_RX.test(teacherEmail)) errors.push(`"${teacherEmail}" is not a valid email`);
      else {
        const t = teachers.get(teacherEmail);
        if (!t) errors.push(`No teacher with email ${teacherEmail} in your school`);
        else { teacherId = t.id; teacherName = t.name; }
      }
    }

    let programId: string | null = null;
    let programName: string | null = null;
    if (program) {
      const p = programs.get(key(program));
      if (!p) errors.push(`Unknown program "${program}"`);
      else { programId = p.id; programName = p.name; }
    }

    let termId: string | null = null;
    let termName: string | null = null;
    let termStartDate: string | null = null;
    let termEndDate: string | null = null;
    if (term) {
      const t = terms.get(key(term));
      if (t) { termId = t.id; termName = t.name; termStartDate = t.start; termEndDate = t.end; }
      else warnings.push(`No term named "${term}"; it will be saved as a text label`);
    }

    return {
      row: i + 2, title, code, description, teacherEmail, program, term,
      teacherId, teacherName, programId, programName, termId, termName, termStartDate, termEndDate,
      errors, warnings,
    };
  });
}

export default router;
