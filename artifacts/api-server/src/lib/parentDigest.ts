import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { isSmtpConfigured, sendRenderedEmail } from "./email";
import { computeStudentMetrics, getRiskThresholds, riskFlags } from "./studentProgress";
import {
  DEFAULT_TOGGLES,
  buildChildSection,
  digestChannels,
  groupChildrenByParent,
  partitionByOptOut,
  renderDigestEmail,
  renderDigestInApp,
  sanitizeMessage,
  type DigestAnnouncement,
  type DigestToggles,
  type DigestWorkLine,
  type ParentDigest,
} from "./digestContent";
import {
  computeNextRun,
  isValidSendTime,
  isValidTimezone,
  periodDays,
  periodLabel,
  type DigestFrequency,
} from "./digestSchedule";

/**
 * Parent progress digest: settings, audience, building each parent's digest
 * and delivering a run (in-app always, email when allowed). Everything is
 * scoped to one school id the caller has already authorised.
 */

export const APP_URL = (process.env.APP_URL ?? process.env.FRONTEND_URL ?? "https://app.solomonquest.com").replace(/\/+$/, "");

export type Audience = "all" | "programs" | "courses";

export interface DigestSettings {
  schoolId: string;
  enabled: boolean;
  frequency: DigestFrequency;
  weekday: number;
  dayOfMonth: number;
  sendTime: string;
  /** null until an admin saves one (the page then defaults to the browser's zone). */
  timezone: string | null;
  include: DigestToggles;
  message: string | null;
  audience: Audience;
  audienceProgramIds: string[];
  audienceCourseIds: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastManualSendAt: string | null;
  updatedAt: string | null;
  stored: boolean;
}

export function defaultSettings(schoolId: string): DigestSettings {
  return {
    schoolId,
    enabled: false,
    frequency: "weekly",
    weekday: 5,
    dayOfMonth: 1,
    sendTime: "16:00",
    timezone: null,
    include: { ...DEFAULT_TOGGLES },
    message: null,
    audience: "all",
    audienceProgramIds: [],
    audienceCourseIds: [],
    nextRunAt: null,
    lastRunAt: null,
    lastManualSendAt: null,
    updatedAt: null,
    stored: false,
  };
}

type Row = Record<string, any>;

export function mapSettingsRow(r: Row): DigestSettings {
  return {
    schoolId: r.school_id,
    enabled: !!r.enabled,
    frequency: r.frequency,
    weekday: Number(r.weekday),
    dayOfMonth: Number(r.day_of_month),
    sendTime: r.send_time,
    timezone: r.timezone ?? null,
    include: {
      grades: r.include_grades !== false,
      attendance: r.include_attendance !== false,
      missingLate: r.include_missing_late !== false,
      completion: r.include_completion !== false,
      upcoming: r.include_upcoming !== false,
      announcements: r.include_announcements !== false,
    },
    message: r.message ?? null,
    audience: r.audience,
    audienceProgramIds: r.audience_program_ids ?? [],
    audienceCourseIds: r.audience_course_ids ?? [],
    nextRunAt: r.next_run_at ?? null,
    lastRunAt: r.last_run_at ?? null,
    lastManualSendAt: r.last_manual_send_at ?? null,
    updatedAt: r.updated_at ?? null,
    stored: true,
  };
}

export function settingsToRow(s: DigestSettings): Row {
  return {
    school_id: s.schoolId,
    enabled: s.enabled,
    frequency: s.frequency,
    weekday: s.weekday,
    day_of_month: s.dayOfMonth,
    send_time: s.sendTime,
    timezone: s.timezone ?? "UTC",
    include_grades: s.include.grades,
    include_attendance: s.include.attendance,
    include_missing_late: s.include.missingLate,
    include_completion: s.include.completion,
    include_upcoming: s.include.upcoming,
    include_announcements: s.include.announcements,
    message: s.message,
    audience: s.audience,
    audience_program_ids: s.audienceProgramIds,
    audience_course_ids: s.audienceCourseIds,
    next_run_at: s.nextRunAt,
  };
}

export async function loadSettings(schoolId: string): Promise<DigestSettings> {
  const { data, error } = await supabaseAdmin.from("school_digest_settings").select("*").eq("school_id", schoolId).maybeSingle();
  if (error || !data) return defaultSettings(schoolId);
  return mapSettingsRow(data);
}

const FREQS: DigestFrequency[] = ["manual", "weekly", "biweekly", "monthly"];
const AUDIENCES: Audience[] = ["all", "programs", "courses"];
const TOGGLE_KEYS = Object.keys(DEFAULT_TOGGLES) as (keyof DigestToggles)[];

/**
 * Validates a (partial) settings body from the admin page onto `base`.
 * Program / course ids must belong to the school (`allowed*`).
 */
export function applySettingsInput(
  base: DigestSettings,
  body: Record<string, unknown>,
  allowedProgramIds: Set<string>,
  allowedCourseIds: Set<string>
): { ok: true; settings: DigestSettings } | { ok: false; error: string } {
  const s: DigestSettings = { ...base, include: { ...base.include } };
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { ok: false, error: "enabled must be true or false" };
    s.enabled = body.enabled;
  }
  if (body.frequency !== undefined) {
    if (!FREQS.includes(body.frequency as DigestFrequency)) return { ok: false, error: "frequency must be manual, weekly, biweekly or monthly" };
    s.frequency = body.frequency as DigestFrequency;
  }
  if (body.weekday !== undefined) {
    const n = Number(body.weekday);
    if (!Number.isInteger(n) || n < 0 || n > 6) return { ok: false, error: "weekday must be 0 (Sunday) to 6 (Saturday)" };
    s.weekday = n;
  }
  if (body.dayOfMonth !== undefined) {
    const n = Number(body.dayOfMonth);
    if (!Number.isInteger(n) || n < 1 || n > 31) return { ok: false, error: "dayOfMonth must be between 1 and 31" };
    s.dayOfMonth = n;
  }
  if (body.sendTime !== undefined) {
    if (!isValidSendTime(body.sendTime)) return { ok: false, error: "sendTime must be HH:MM (24-hour)" };
    s.sendTime = body.sendTime;
  }
  if (body.timezone !== undefined) {
    if (!isValidTimezone(body.timezone)) return { ok: false, error: "timezone is not a valid IANA time zone" };
    s.timezone = body.timezone;
  }
  if (body.include !== undefined) {
    if (!body.include || typeof body.include !== "object") return { ok: false, error: "include must be an object" };
    const inc = body.include as Record<string, unknown>;
    for (const k of TOGGLE_KEYS) {
      if (inc[k] === undefined) continue;
      if (typeof inc[k] !== "boolean") return { ok: false, error: `include.${k} must be true or false` };
      s.include[k] = inc[k] as boolean;
    }
  }
  if (body.message !== undefined) {
    const m = sanitizeMessage(body.message);
    if (!m.ok) return { ok: false, error: m.error };
    s.message = m.value;
  }
  if (body.audience !== undefined) {
    if (!AUDIENCES.includes(body.audience as Audience)) return { ok: false, error: "audience must be all, programs or courses" };
    s.audience = body.audience as Audience;
  }
  const ids = (v: unknown, allowed: Set<string>, name: string): string[] | string => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return `${name} must be a list of ids`;
    const unique = Array.from(new Set(v as string[]));
    if (unique.length > 500) return `${name} has too many entries`;
    if (unique.some((id) => !allowed.has(id))) return `${name} contains an id that isn't in this school`;
    return unique;
  };
  if (body.audienceProgramIds !== undefined) {
    const r = ids(body.audienceProgramIds, allowedProgramIds, "audienceProgramIds");
    if (typeof r === "string") return { ok: false, error: r };
    s.audienceProgramIds = r;
  }
  if (body.audienceCourseIds !== undefined) {
    const r = ids(body.audienceCourseIds, allowedCourseIds, "audienceCourseIds");
    if (typeof r === "string") return { ok: false, error: r };
    s.audienceCourseIds = r;
  }
  if (s.audience === "programs" && s.audienceProgramIds.length === 0) return { ok: false, error: "Pick at least one program, or send to all parents" };
  if (s.audience === "courses" && s.audienceCourseIds.length === 0) return { ok: false, error: "Pick at least one course, or send to all parents" };
  if (s.enabled && s.frequency !== "manual" && !s.timezone) return { ok: false, error: "Choose a time zone for the schedule" };
  return { ok: true, settings: s };
}

/** Next scheduled send for these settings, or null (disabled / manual). */
export function scheduleFor(s: DigestSettings, now: Date, previous?: Date | null): string | null {
  if (!s.enabled || s.frequency === "manual" || !s.timezone) return null;
  const next = computeNextRun(
    { frequency: s.frequency, weekday: s.weekday, dayOfMonth: s.dayOfMonth, sendTime: s.sendTime, timezone: s.timezone },
    now,
    previous
  );
  return next ? next.toISOString() : null;
}

// ─── Audience ───────────────────────────────────────────────────────────────

const CHUNK = 150;

async function inChunks<T>(ids: string[], fn: (part: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await fn(unique.slice(i, i + CHUNK));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

export interface ParentProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  notification_prefs: unknown;
}

export interface ResolvedAudience {
  schoolCourses: { id: string; title: string; program_id: string | null }[];
  /** parentId -> their children who are students of this school */
  childrenByParent: Map<string, string[]>;
  parents: Map<string, ParentProfile>;
  students: Map<string, { id: string; first_name: string | null; last_name: string | null }>;
}

export async function schoolCourses(schoolId: string): Promise<{ id: string; title: string; program_id: string | null }[]> {
  const { data, error } = await supabaseAdmin.from("courses").select("id, title, program_id").eq("school_id", schoolId);
  if (error) throw error;
  return (data ?? []) as { id: string; title: string; program_id: string | null }[];
}

/**
 * Parents the digest goes to under `settings.audience`, with every child of
 * theirs at this school (siblings outside the selected programs/courses are
 * still included, so each parent gets one complete digest). Only profiles
 * with role student + this school_id count as children, and only role
 * parent as recipients.
 */
export async function resolveAudience(schoolId: string, settings: DigestSettings): Promise<ResolvedAudience> {
  const courses = await schoolCourses(schoolId);
  let scoped = courses;
  if (settings.audience === "programs") {
    const set = new Set(settings.audienceProgramIds);
    scoped = courses.filter((c) => c.program_id && set.has(c.program_id));
  } else if (settings.audience === "courses") {
    const set = new Set(settings.audienceCourseIds);
    scoped = courses.filter((c) => set.has(c.id));
  }
  const empty: ResolvedAudience = { schoolCourses: courses, childrenByParent: new Map(), parents: new Map(), students: new Map() };
  if (scoped.length === 0) return empty;

  const enrollments = await inChunks<Row>(scoped.map((c) => c.id), (part) =>
    supabaseAdmin.from("course_enrollments").select("student_id").in("course_id", part).eq("status", "active")
  );
  const audienceStudentIds = Array.from(new Set(enrollments.map((e) => e.student_id as string)));
  if (audienceStudentIds.length === 0) return empty;

  const firstLinks = await inChunks<Row>(audienceStudentIds, (part) =>
    supabaseAdmin.from("parent_student_links").select("parent_id, student_id").in("student_id", part)
  );
  const parentIds = Array.from(new Set(firstLinks.map((l) => l.parent_id as string)));
  if (parentIds.length === 0) return empty;

  // Every child of those parents (siblings), then keep this school's students.
  const allLinks = await inChunks<Row>(parentIds, (part) =>
    supabaseAdmin.from("parent_student_links").select("parent_id, student_id").in("parent_id", part)
  );
  const childIds = Array.from(new Set(allLinks.map((l) => l.student_id as string)));
  const studentRows = await inChunks<Row>(childIds, (part) =>
    supabaseAdmin.from("profiles").select("id, first_name, last_name, role, school_id").in("id", part)
  );
  const students = new Map(
    studentRows
      .filter((p) => p.role === "student" && p.school_id === schoolId)
      .map((p) => [p.id as string, { id: p.id as string, first_name: p.first_name ?? null, last_name: p.last_name ?? null }])
  );
  // A parent is only in the audience through a child who is in it.
  const audienceSet = new Set(audienceStudentIds.filter((id) => students.has(id)));
  const viaAudience = new Set(firstLinks.filter((l) => audienceSet.has(l.student_id)).map((l) => l.parent_id as string));

  const parentRows = await inChunks<Row>(Array.from(viaAudience), (part) =>
    supabaseAdmin.from("profiles").select("id, first_name, last_name, email, notification_prefs, role").in("id", part)
  );
  const parents = new Map<string, ParentProfile>(
    parentRows.filter((p) => p.role === "parent").map((p) => [p.id as string, p as ParentProfile])
  );
  const grouped = groupChildrenByParent(
    allLinks.filter((l) => parents.has(l.parent_id)).map((l) => ({ parentId: l.parent_id as string, studentId: l.student_id as string })),
    new Set(students.keys())
  );
  return { schoolCourses: courses, childrenByParent: grouped, parents, students };
}

export async function audienceSummary(schoolId: string, settings: DigestSettings): Promise<{ parents: number; students: number; optedOut: number }> {
  const a = await resolveAudience(schoolId, settings);
  const { deliver, optedOut } = partitionByOptOut(Array.from(a.parents.values()));
  const kids = new Set<string>();
  for (const p of deliver) for (const k of a.childrenByParent.get(p.id) ?? []) kids.add(k);
  return { parents: deliver.length, students: kids.size, optedOut: optedOut.length };
}

// ─── Building digests ───────────────────────────────────────────────────────

interface School {
  name: string;
  logoUrl: string | null;
}

async function loadSchool(schoolId: string): Promise<School> {
  const { data } = await supabaseAdmin.from("schools").select("name, logo_url").eq("id", schoolId).maybeSingle();
  return { name: (data?.name as string) || "Your school", logoUrl: (data?.logo_url as string | null) ?? null };
}

/**
 * Builds the digest for each parent in `childrenByParent`. All data comes
 * from this school's courses only.
 */
export async function buildDigests(opts: {
  schoolId: string;
  settings: DigestSettings;
  childrenByParent: Map<string, string[]>;
  parentNames: Map<string, string>;
  students: Map<string, { first_name: string | null; last_name: string | null }>;
  schoolCourses: { id: string; title: string }[];
  now?: Date;
}): Promise<Map<string, ParentDigest>> {
  const now = opts.now ?? new Date();
  const { settings } = opts;
  const tz = settings.timezone ?? "UTC";
  const out = new Map<string, ParentDigest>();
  const childIds = Array.from(new Set(Array.from(opts.childrenByParent.values()).flat()));
  const school = await loadSchool(opts.schoolId);
  const courseTitle = new Map(opts.schoolCourses.map((c) => [c.id, c.title]));

  const thresholds = await getRiskThresholds(opts.schoolId);
  const metrics =
    childIds.length > 0
      ? await computeStudentMetrics({
          courseIds: opts.schoolCourses.map((c) => c.id),
          studentIds: childIds,
          loginLookbackDays: Math.max(thresholds.inactiveDays, 30),
          now,
        })
      : new Map();

  // Upcoming: published work due in the next 7 days, not yet handed in.
  const upcomingByStudent = new Map<string, DigestWorkLine[]>();
  if (settings.include.upcoming && childIds.length) {
    const courseIdsOfKids = Array.from(new Set(Array.from(metrics.values()).flatMap((m) => m.courses.map((c: { courseId: string }) => c.courseId))));
    const until = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const assignments = await inChunks<Row>(courseIdsOfKids, (part) =>
      supabaseAdmin
        .from("assignments")
        .select("id, title, course_id, due_date")
        .in("course_id", part)
        .eq("is_published", true)
        .gte("due_date", now.toISOString())
        .lte("due_date", until)
    );
    const subs = assignments.length
      ? await inChunks<Row>(assignments.map((a) => a.id as string), (part) =>
          supabaseAdmin.from("submissions").select("assignment_id, student_id, status").in("assignment_id", part)
        )
      : [];
    const handedIn = new Set(
      subs.filter((s) => s.status === "submitted" || s.status === "graded").map((s) => `${s.assignment_id}:${s.student_id}`)
    );
    assignments.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    for (const [studentId, m] of metrics) {
      const mine = new Set(m.courses.map((c: { courseId: string }) => c.courseId));
      upcomingByStudent.set(
        studentId,
        assignments
          .filter((a) => mine.has(a.course_id) && !handedIn.has(`${a.id}:${studentId}`))
          .map((a) => ({ title: a.title as string, courseTitle: courseTitle.get(a.course_id) ?? null, dueDate: a.due_date as string }))
      );
    }
  }

  // Recent announcements: school-wide plus each child's courses.
  let announcements: Row[] = [];
  if (settings.include.announcements) {
    const since = new Date(now.getTime() - periodDays(settings.frequency) * 86_400_000).toISOString();
    const { data } = await supabaseAdmin
      .from("announcements")
      .select("title, course_id, created_at")
      .eq("school_id", opts.schoolId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);
    announcements = data ?? [];
  }

  for (const [parentId, kids] of opts.childrenByParent) {
    const children = kids
      .map((id) => {
        const p = opts.students.get(id);
        const m = metrics.get(id);
        return buildChildSection({
          studentId: id,
          firstName: p?.first_name ?? "",
          lastName: p?.last_name ?? "",
          metrics: m,
          flags: m ? riskFlags(m, thresholds, now) : [],
          thresholds,
          toggles: settings.include,
          upcoming: upcomingByStudent.get(id) ?? [],
        });
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    let anns: DigestAnnouncement[] | undefined;
    if (settings.include.announcements) {
      const kidCourses = new Set(kids.flatMap((id) => (metrics.get(id)?.courses ?? []).map((c: { courseId: string }) => c.courseId)));
      anns = announcements
        .filter((a) => !a.course_id || kidCourses.has(a.course_id))
        .slice(0, 5)
        .map((a) => ({ title: a.title as string, courseTitle: a.course_id ? courseTitle.get(a.course_id) ?? null : null, createdAt: a.created_at as string }));
    }
    out.set(parentId, {
      parentId,
      parentFirstName: opts.parentNames.get(parentId) ?? "",
      schoolName: school.name,
      schoolLogoUrl: school.logoUrl,
      timezone: tz,
      periodLabel: periodLabel(settings.frequency),
      message: settings.message,
      toggles: settings.include,
      children,
      announcements: anns,
    });
  }
  return out;
}

/**
 * Preview for one student: the digest their (first) linked parent would
 * get, siblings included. Falls back to a digest for just that student
 * when no parent is linked yet.
 */
export async function previewForStudent(schoolId: string, settings: DigestSettings, studentId: string): Promise<{
  digest: ParentDigest;
  parentName: string | null;
  parentCount: number;
  optedOut: boolean;
} | null> {
  const { data: student } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role, school_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || student.role !== "student" || student.school_id !== schoolId) return null;

  const { data: links } = await supabaseAdmin.from("parent_student_links").select("parent_id").eq("student_id", studentId);
  const parentIds = (links ?? []).map((l) => l.parent_id as string);
  let parent: ParentProfile | null = null;
  let parentCount = 0;
  if (parentIds.length) {
    const { data: ps } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, notification_prefs, role")
      .in("id", parentIds);
    const parents = (ps ?? []).filter((p) => p.role === "parent") as (ParentProfile & { role: string })[];
    parentCount = parents.length;
    parent = parents.sort((a, b) => (a.first_name ?? "").localeCompare(b.first_name ?? ""))[0] ?? null;
  }

  const students = new Map<string, { first_name: string | null; last_name: string | null }>();
  students.set(studentId, { first_name: student.first_name ?? null, last_name: student.last_name ?? null });
  let kids = [studentId];
  if (parent) {
    const { data: sib } = await supabaseAdmin.from("parent_student_links").select("student_id").eq("parent_id", parent.id);
    const sibIds = (sib ?? []).map((l) => l.student_id as string).filter((id) => id !== studentId);
    if (sibIds.length) {
      const { data: sp } = await supabaseAdmin.from("profiles").select("id, first_name, last_name, role, school_id").in("id", sibIds);
      for (const p of sp ?? []) {
        if (p.role === "student" && p.school_id === schoolId) {
          students.set(p.id as string, { first_name: p.first_name ?? null, last_name: p.last_name ?? null });
          kids.push(p.id as string);
        }
      }
    }
  }
  kids = Array.from(new Set(kids));
  const key = parent?.id ?? "preview";
  const digests = await buildDigests({
    schoolId,
    settings,
    childrenByParent: new Map([[key, kids]]),
    parentNames: new Map([[key, parent?.first_name ?? ""]]),
    students,
    schoolCourses: await schoolCourses(schoolId),
  });
  const digest = digests.get(key)!;
  return {
    digest,
    parentName: parent ? [parent.first_name, parent.last_name].filter(Boolean).join(" ") || "Parent" : null,
    parentCount,
    optedOut: parent ? (parent.notification_prefs as Record<string, unknown> | null)?.digest === false : false,
  };
}

// ─── Running a send ─────────────────────────────────────────────────────────

const EMAIL_DELAY_MS = Math.max(0, Number(process.env.DIGEST_EMAIL_DELAY_MS ?? 250) || 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function updateRun(runId: string, fields: Row): Promise<void> {
  const { error } = await supabaseAdmin.from("digest_runs").update(fields).eq("id", runId);
  if (error) logger.warn({ err: error, runId }, "[digest] run update failed");
}

/**
 * Delivers one run: resolves the audience, skips parents who turned the
 * digest off, writes every in-app notification, then sends emails one at a
 * time with a small pause so SMTP isn't flooded. Counts land on the
 * digest_runs row as it goes.
 */
export async function executeRun(runId: string, schoolId: string, settings: DigestSettings): Promise<void> {
  try {
    const audience = await resolveAudience(schoolId, settings);
    const { deliver, optedOut } = partitionByOptOut(Array.from(audience.parents.values()));
    const childrenByParent = new Map<string, string[]>();
    for (const p of deliver) {
      const kids = audience.childrenByParent.get(p.id);
      if (kids?.length) childrenByParent.set(p.id, kids);
    }
    await updateRun(runId, { recipients: childrenByParent.size, skipped_opted_out: optedOut.length });

    const digests = await buildDigests({
      schoolId,
      settings,
      childrenByParent,
      parentNames: new Map(deliver.map((p) => [p.id, p.first_name ?? ""])),
      students: audience.students,
      schoolCourses: audience.schoolCourses,
    });

    const rows = Array.from(digests.values()).map((d) => {
      const n = renderDigestInApp(d);
      return {
        user_id: d.parentId,
        type: "digest",
        title: n.title,
        body: n.body,
        link: n.link,
        metadata: { digestRunId: runId, schoolId, studentIds: d.children.map((c) => c.studentId) },
        is_read: false,
      };
    });
    let inApp = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("notifications").insert(part);
      if (error) logger.error({ err: error, runId }, "[digest] notification insert failed");
      else inApp += part.length;
    }
    await updateRun(runId, { in_app_sent: inApp });

    const smtp = isSmtpConfigured();
    let sent = 0;
    let failed = 0;
    const profiles = new Map(deliver.map((p) => [p.id, p]));
    for (const d of digests.values()) {
      const p = profiles.get(d.parentId);
      if (!p || !digestChannels(p.notification_prefs as Record<string, unknown>, !!p.email, smtp).email) continue;
      const { subject, html } = renderDigestEmail(d, APP_URL);
      try {
        await sendRenderedEmail(p.email as string, subject, html);
        sent += 1;
      } catch (err) {
        failed += 1;
        logger.warn({ err, runId, parentId: p.id }, "[digest] email failed");
      }
      if ((sent + failed) % 20 === 0) await updateRun(runId, { emails_sent: sent, emails_failed: failed });
      if (EMAIL_DELAY_MS) await sleep(EMAIL_DELAY_MS);
    }
    await updateRun(runId, { emails_sent: sent, emails_failed: failed, status: "completed", finished_at: new Date().toISOString() });
  } catch (err) {
    logger.error({ err, runId, schoolId }, "[digest] run failed");
    await updateRun(runId, {
      status: "failed",
      error: (err as Error)?.message?.slice(0, 500) ?? "Unknown error",
      finished_at: new Date().toISOString(),
    });
  }
}
