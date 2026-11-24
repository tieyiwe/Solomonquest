import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";

/**
 * Late-work rules and per-student extensions (late-work-and-alerts.sql).
 *
 * Effective due date for a student = their extension's extended_due_at if
 * one exists, else the assignment's due_date. Lateness is measured against
 * the effective due date. The hard cutoff (late_cutoff_at) is pushed out to
 * the extended due date when an extension is later than the cutoff.
 *
 * Penalty = min(late_penalty_per_day * ceil(days late), late_penalty_max),
 * or 0 when the extension waives it. `submissions.grade` stores the score
 * after the penalty (what counts everywhere); `raw_grade` keeps the score
 * the teacher entered and `late_penalty_percent` the % deducted.
 *
 * Every reader tolerates the migration not having been applied yet: the
 * columns are then simply absent from `select("*")` rows and the extension
 * lookups return nothing, so behaviour falls back to "no late rules".
 */

export interface LatePolicy {
  allowLateSubmissions: boolean;
  latePenaltyPerDay: number;
  latePenaltyMax: number;
  lateCutoffAt: string | null;
}

export interface Extension {
  id: string;
  assignmentId: string;
  studentId: string;
  extendedDueAt: string;
  waivePenalty: boolean;
  reason: string | null;
  grantedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** True when late-work-and-alerts.sql has been applied (the row has the column). */
export function hasLateColumns(assignment: Record<string, unknown> | null | undefined): boolean {
  return !!assignment && "allow_late_submissions" in assignment;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function latePolicyOf(a: Record<string, unknown>): LatePolicy {
  return {
    allowLateSubmissions: a.allow_late_submissions !== false,
    latePenaltyPerDay: num(a.late_penalty_per_day, 0),
    latePenaltyMax: num(a.late_penalty_max, 100),
    lateCutoffAt: (a.late_cutoff_at as string | null) ?? null,
  };
}

export function mapExtension(r: Record<string, unknown>): Extension {
  return {
    id: r.id as string,
    assignmentId: r.assignment_id as string,
    studentId: r.student_id as string,
    extendedDueAt: r.extended_due_at as string,
    waivePenalty: r.waive_penalty === true,
    reason: (r.reason as string | null) ?? null,
    grantedBy: (r.granted_by as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

/** One student's extensions for these assignments, keyed by assignment id. */
export async function getStudentExtensions(studentId: string, assignmentIds: string[]): Promise<Map<string, Extension>> {
  const map = new Map<string, Extension>();
  if (!studentId || assignmentIds.length === 0) return map;
  for (let i = 0; i < assignmentIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("assignment_extensions")
      .select("*")
      .eq("student_id", studentId)
      .in("assignment_id", assignmentIds.slice(i, i + 200));
    if (error) return map; // table not created yet
    for (const r of data ?? []) map.set(r.assignment_id as string, mapExtension(r));
  }
  return map;
}

/** Every student's extensions for these assignments, keyed `${assignmentId}:${studentId}`. */
export async function getExtensionsForAssignments(assignmentIds: string[]): Promise<Map<string, Extension>> {
  const map = new Map<string, Extension>();
  for (let i = 0; i < assignmentIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("assignment_extensions")
      .select("*")
      .in("assignment_id", assignmentIds.slice(i, i + 200));
    if (error) return map;
    for (const r of data ?? []) map.set(`${r.assignment_id}:${r.student_id}`, mapExtension(r));
  }
  return map;
}

export async function getExtension(assignmentId: string, studentId: string): Promise<Extension | null> {
  const { data, error } = await supabaseAdmin
    .from("assignment_extensions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error || !data) return null;
  return mapExtension(data);
}

export function effectiveDueDate(dueDate: string | null | undefined, ext: Extension | null | undefined): string | null {
  return ext?.extendedDueAt ?? dueDate ?? null;
}

export function minutesLate(submittedAt: string | Date | null | undefined, effectiveDue: string | null): number {
  if (!submittedAt || !effectiveDue) return 0;
  const diff = new Date(submittedAt).getTime() - new Date(effectiveDue).getTime();
  return diff > 0 ? Math.ceil(diff / 60000) : 0;
}

export function daysLateFromMinutes(mins: number): number {
  return mins > 0 ? Math.ceil(mins / 1440) : 0;
}

export function penaltyPercent(policy: LatePolicy, mins: number, waived: boolean): number {
  if (waived || mins <= 0) return 0;
  const raw = policy.latePenaltyPerDay * daysLateFromMinutes(mins);
  return Math.max(0, Math.min(raw, policy.latePenaltyMax, 100));
}

export function applyPenalty(rawGrade: number, pct: number): number {
  return Math.round(rawGrade * (1 - pct / 100) * 100) / 100;
}

/** The cutoff that applies to this student (extension pushes it out). */
export function effectiveCutoff(policy: LatePolicy, ext: Extension | null | undefined): string | null {
  if (!policy.lateCutoffAt) return null;
  if (ext && new Date(ext.extendedDueAt).getTime() > new Date(policy.lateCutoffAt).getTime()) return ext.extendedDueAt;
  return policy.lateCutoffAt;
}

/** May this student hand in now? Returns a refusal reason, or null. */
export function submissionRefusal(
  assignment: Record<string, unknown>,
  ext: Extension | null,
  now: Date = new Date()
): string | null {
  if (!hasLateColumns(assignment)) return null;
  const policy = latePolicyOf(assignment);
  const due = effectiveDueDate(assignment.due_date as string | null, ext);
  const cutoff = effectiveCutoff(policy, ext);
  if (cutoff && now.getTime() > new Date(cutoff).getTime()) {
    return "The deadline for this assignment has passed and submissions are closed.";
  }
  if (!policy.allowLateSubmissions && due && now.getTime() > new Date(due).getTime()) {
    return "This assignment does not accept late submissions.";
  }
  return null;
}

/** camelCase late-policy fields for API responses. */
export function latePolicyFields(a: Record<string, unknown>) {
  const p = latePolicyOf(a);
  return {
    allowLateSubmissions: p.allowLateSubmissions,
    latePenaltyPerDay: p.latePenaltyPerDay,
    latePenaltyMax: p.latePenaltyMax,
    lateCutoffAt: p.lateCutoffAt,
  };
}

/** camelCase lateness fields of a submission row. */
export function submissionLateFields(s: Record<string, unknown>) {
  const mins = num(s.minutes_late, 0);
  return {
    submittedLate: s.submitted_late === true,
    minutesLate: mins,
    daysLate: daysLateFromMinutes(mins),
    rawGrade: (s.raw_grade as number | null) ?? null,
    latePenaltyPercent: num(s.late_penalty_percent, 0),
  };
}

/**
 * Parses late-policy settings from a create/update body (accepts snake_case
 * and camelCase, like the rest of the assignment routes). Returns only the
 * keys present, or an error string.
 */
export function parseLatePolicyInput(body: Record<string, unknown>): { updates: Record<string, unknown>; error: string | null } {
  const updates: Record<string, unknown> = {};
  const pick = (a: string, b: string) => (body[a] !== undefined ? body[a] : body[b]);

  const allow = pick("allow_late_submissions", "allowLateSubmissions");
  if (allow !== undefined) {
    if (typeof allow !== "boolean") return { updates, error: "allow_late_submissions must be true or false" };
    updates.allow_late_submissions = allow;
  }
  // Blank per-day penalty = none (0); blank maximum = no cap (100).
  for (const [snake, camel, label, blank] of [
    ["late_penalty_per_day", "latePenaltyPerDay", "Penalty per day", 0],
    ["late_penalty_max", "latePenaltyMax", "Maximum penalty", 100],
  ] as const) {
    const v = pick(snake, camel);
    if (v === undefined) continue;
    const n = v === null || v === "" ? blank : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { updates, error: `${label} must be between 0 and 100` };
    updates[snake] = n;
  }
  const cutoff = pick("late_cutoff_at", "lateCutoffAt");
  if (cutoff !== undefined) {
    if (cutoff === null || cutoff === "") updates.late_cutoff_at = null;
    else if (typeof cutoff !== "string" || isNaN(Date.parse(cutoff))) return { updates, error: "late_cutoff_at must be a valid date" };
    else updates.late_cutoff_at = new Date(cutoff).toISOString();
  }
  return { updates, error: null };
}

/**
 * Recomputes one submission's lateness (and, if already graded, its
 * penalised grade + transcript row) after an extension changes.
 */
export async function recomputeSubmissionLateness(assignmentId: string, studentId: string): Promise<void> {
  const [{ data: assignment }, { data: sub }] = await Promise.all([
    supabaseAdmin.from("assignments").select("*").eq("id", assignmentId).maybeSingle(),
    supabaseAdmin.from("submissions").select("*").eq("assignment_id", assignmentId).eq("student_id", studentId).maybeSingle(),
  ]);
  if (!assignment || !sub || !hasLateColumns(assignment) || !("raw_grade" in sub)) return;
  if (sub.status !== "submitted" && sub.status !== "graded") return;

  const ext = await getExtension(assignmentId, studentId);
  const due = effectiveDueDate(assignment.due_date as string | null, ext);
  const mins = minutesLate(sub.submitted_at as string | null, due);
  const updates: Record<string, unknown> = { submitted_late: mins > 0, minutes_late: mins };

  const raw = (sub.raw_grade as number | null) ?? null;
  if (raw !== null && sub.grade !== null && sub.grade !== undefined) {
    const pct = penaltyPercent(latePolicyOf(assignment), mins, ext?.waivePenalty === true);
    updates.late_penalty_percent = pct;
    updates.grade = applyPenalty(Number(raw), pct);
  }

  const { error } = await supabaseAdmin.from("submissions").update(updates).eq("id", sub.id as string);
  if (error) {
    logger.warn({ err: error }, "recomputeSubmissionLateness update failed");
    return;
  }
  if (updates.grade !== undefined) {
    await supabaseAdmin.from("transcripts").update({ grade: String(updates.grade) }).eq("submission_id", sub.id as string);
  }
}
