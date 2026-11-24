import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { isSmtpConfigured, sendRenderedEmail } from "../lib/email";
import {
  APP_URL,
  applySettingsInput,
  audienceSummary,
  executeRun,
  loadSettings,
  previewForStudent,
  scheduleFor,
  schoolCourses,
  settingsToRow,
  type DigestSettings,
} from "../lib/parentDigest";
import {
  MESSAGE_MAX,
  SEND_NOW_INTERVAL_MS,
  SlidingWindowLimiter,
  TEST_EMAILS_PER_HOUR,
  renderDigestEmail,
  renderDigestInApp,
  sendNowRetryAfterMs,
} from "../lib/digestContent";

/**
 * Parent progress digest (school admins; super_admin may pass ?schoolId=).
 *
 *   GET  /parent-digest/settings     settings + next run + whether email works
 *   PUT  /parent-digest/settings     save settings (recomputes next_run_at)
 *   GET  /parent-digest/options      students, programs, courses for the page
 *   GET  /parent-digest/audience     how many parents a send reaches now
 *   POST /parent-digest/preview      { studentId, settings? } -> email + in-app
 *   POST /parent-digest/test         { studentId?, settings? } -> to the caller (5/hour)
 *   POST /parent-digest/send-now     send to the audience (1 per 10 min per school)
 *   GET  /parent-digest/runs         send history
 *
 * Teachers, students, parents and staff get 403. Every query is scoped to
 * the caller's school; ids from the body are checked against it.
 */
const router: IRouter = Router();

const testLimiter = new SlidingWindowLimiter(TEST_EMAILS_PER_HOUR, 60 * 60_000);

/** The school the caller administers, or null after sending 403/400. */
function adminSchool(req: AuthenticatedRequest, res: Response): string | null {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Only school admins can manage the parent digest" });
    return null;
  }
  const requested = typeof req.query.schoolId === "string" ? req.query.schoolId : "";
  const schoolId = req.userRole === "super_admin" && requested ? requested : req.schoolId ?? null;
  if (!schoolId) {
    res.status(400).json({ error: "No school associated with this account" });
    return null;
  }
  return schoolId;
}

function present(s: DigestSettings) {
  return {
    enabled: s.enabled,
    frequency: s.frequency,
    weekday: s.weekday,
    dayOfMonth: s.dayOfMonth,
    sendTime: s.sendTime,
    timezone: s.timezone,
    include: s.include,
    message: s.message,
    audience: s.audience,
    audienceProgramIds: s.audienceProgramIds,
    audienceCourseIds: s.audienceCourseIds,
    nextRunAt: s.nextRunAt,
    lastRunAt: s.lastRunAt,
    updatedAt: s.updatedAt,
    stored: s.stored,
  };
}

async function allowedIds(schoolId: string): Promise<{ programs: Set<string>; courses: Set<string> }> {
  const [{ data: programs }, courses] = await Promise.all([
    supabaseAdmin.from("programs").select("id").eq("school_id", schoolId),
    schoolCourses(schoolId),
  ]);
  return { programs: new Set((programs ?? []).map((p) => p.id as string)), courses: new Set(courses.map((c) => c.id)) };
}

/** Saved settings with optional unsaved overrides from the page (preview/test). */
async function settingsWithOverrides(schoolId: string, overrides: unknown): Promise<{ ok: true; settings: DigestSettings } | { ok: false; error: string }> {
  const base = await loadSettings(schoolId);
  if (!overrides || typeof overrides !== "object") return { ok: true, settings: base };
  const ids = await allowedIds(schoolId);
  // Preview / test don't need a schedule, so don't let a missing zone block them.
  const r = applySettingsInput({ ...base, enabled: false }, overrides as Record<string, unknown>, ids.programs, ids.courses);
  if (!r.ok) return r;
  return { ok: true, settings: { ...r.settings, timezone: r.settings.timezone ?? "UTC" } };
}

router.get("/parent-digest/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  const s = await loadSettings(schoolId);
  res.json({
    ...present(s),
    smtpConfigured: isSmtpConfigured(),
    messageMax: MESSAGE_MAX,
    sendNowRetryAfterMs: sendNowRetryAfterMs(s.lastManualSendAt),
  });
});

router.put("/parent-digest/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  const base = await loadSettings(schoolId);
  const ids = await allowedIds(schoolId);
  const r = applySettingsInput(base, (req.body ?? {}) as Record<string, unknown>, ids.programs, ids.courses);
  if (!r.ok) {
    res.status(400).json({ error: r.error });
    return;
  }
  const s = r.settings;
  s.nextRunAt = scheduleFor(s, new Date());
  const row = { ...settingsToRow(s), updated_by: req.userId ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabaseAdmin.from("school_digest_settings").upsert(row, { onConflict: "school_id" });
  if (error) {
    res.status(500).json({ error: /school_digest_settings/.test(error.message) ? "Run parent-digest.sql first" : error.message });
    return;
  }
  const saved = await loadSettings(schoolId);
  res.json({ ...present(saved), smtpConfigured: isSmtpConfigured(), messageMax: MESSAGE_MAX, sendNowRetryAfterMs: sendNowRetryAfterMs(saved.lastManualSendAt) });
});

router.get("/parent-digest/options", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  const [{ data: students }, { data: programs }, courses] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("school_id", schoolId)
      .eq("role", "student")
      .order("first_name", { ascending: true })
      .limit(2000),
    supabaseAdmin.from("programs").select("id, name").eq("school_id", schoolId).order("name"),
    schoolCourses(schoolId),
  ]);
  const ids = (students ?? []).map((s) => s.id as string);
  const linked = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabaseAdmin.from("parent_student_links").select("student_id").in("student_id", ids.slice(i, i + 150));
    for (const l of data ?? []) linked.set(l.student_id as string, (linked.get(l.student_id as string) ?? 0) + 1);
  }
  res.json({
    students: (students ?? []).map((s) => ({
      id: s.id,
      name: [s.first_name, s.last_name].filter(Boolean).join(" ") || "Student",
      parentCount: linked.get(s.id as string) ?? 0,
    })),
    programs: (programs ?? []).map((p) => ({ id: p.id, name: p.name })),
    courses: courses.map((c) => ({ id: c.id, title: c.title, programId: c.program_id })).sort((a, b) => a.title.localeCompare(b.title)),
  });
});

router.get("/parent-digest/audience", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  try {
    res.json(await audienceSummary(schoolId, await loadSettings(schoolId)));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message ?? "Could not count recipients" });
  }
});

router.post("/parent-digest/preview", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  const studentId = typeof req.body?.studentId === "string" ? req.body.studentId : "";
  if (!studentId) {
    res.status(400).json({ error: "Pick a student to preview" });
    return;
  }
  const s = await settingsWithOverrides(schoolId, req.body?.settings);
  if (!s.ok) {
    res.status(400).json({ error: s.error });
    return;
  }
  try {
    const p = await previewForStudent(schoolId, s.settings, studentId);
    if (!p) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    res.json({
      parentName: p.parentName,
      parentCount: p.parentCount,
      parentOptedOut: p.optedOut,
      children: p.digest.children.map((c) => ({ studentId: c.studentId, name: c.fullName })),
      email: renderDigestEmail(p.digest, APP_URL),
      inApp: renderDigestInApp(p.digest),
    });
  } catch (err) {
    logger.error({ err }, "[digest] preview failed");
    res.status(500).json({ error: "Could not build the preview" });
  }
});

router.post("/parent-digest/test", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  const limit = testLimiter.take(req.userId ?? "anon");
  if (!limit.ok) {
    const mins = Math.ceil(limit.retryAfterMs / 60_000);
    res.setHeader("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    res.status(429).json({ error: `You can send ${TEST_EMAILS_PER_HOUR} test digests an hour. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` });
    return;
  }
  const s = await settingsWithOverrides(schoolId, req.body?.settings);
  if (!s.ok) {
    res.status(400).json({ error: s.error });
    return;
  }
  let studentId = typeof req.body?.studentId === "string" ? req.body.studentId : "";
  if (!studentId) {
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("school_id", schoolId).eq("role", "student").limit(1);
    studentId = (data?.[0]?.id as string) ?? "";
  }
  if (!studentId) {
    res.status(400).json({ error: "Your school has no students yet, so there's nothing to put in a test digest" });
    return;
  }
  const p = await previewForStudent(schoolId, s.settings, studentId);
  if (!p) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const { data: me } = await supabaseAdmin.from("profiles").select("email, first_name").eq("id", req.userId ?? "").maybeSingle();
  const digest = { ...p.digest, parentFirstName: (me?.first_name as string) ?? p.digest.parentFirstName };
  const inApp = renderDigestInApp(digest);
  await supabaseAdmin.from("notifications").insert({
    user_id: req.userId,
    type: "digest",
    title: `[Test] ${inApp.title}`,
    body: inApp.body,
    link: inApp.link,
    metadata: { digestTest: true, schoolId },
    is_read: false,
  });
  let email: "sent" | "not_configured" | "no_address" | "failed" = "not_configured";
  if (isSmtpConfigured()) {
    if (!me?.email) email = "no_address";
    else {
      const { subject, html } = renderDigestEmail(digest, APP_URL);
      try {
        await sendRenderedEmail(me.email as string, `[Test] ${subject}`, html);
        email = "sent";
      } catch (err) {
        logger.warn({ err }, "[digest] test email failed");
        email = "failed";
      }
    }
  }
  res.json({ email, to: (me?.email as string | null) ?? null, inApp: true });
});

router.post("/parent-digest/send-now", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  const settings = await loadSettings(schoolId);
  if (!settings.stored) {
    res.status(400).json({ error: "Save the digest settings before sending" });
    return;
  }
  // Atomic per-school limit: only one request can move last_manual_send_at
  // forward within the window, even across server instances.
  const now = new Date();
  const cutoff = new Date(now.getTime() - SEND_NOW_INTERVAL_MS).toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("school_digest_settings")
    .update({ last_manual_send_at: now.toISOString() })
    .eq("school_id", schoolId)
    .or(`last_manual_send_at.is.null,last_manual_send_at.lt.${cutoff}`)
    .select("school_id")
    .maybeSingle();
  if (claimError) {
    res.status(500).json({ error: claimError.message });
    return;
  }
  if (!claimed) {
    const wait = sendNowRetryAfterMs((await loadSettings(schoolId)).lastManualSendAt, now.getTime()) || SEND_NOW_INTERVAL_MS;
    const mins = Math.max(1, Math.ceil(wait / 60_000));
    res.setHeader("Retry-After", String(Math.ceil(wait / 1000)));
    res.status(429).json({ error: `A digest was sent in the last 10 minutes. You can send again in ${mins} minute${mins === 1 ? "" : "s"}.` });
    return;
  }
  const { data: run, error } = await supabaseAdmin
    .from("digest_runs")
    .insert({ school_id: schoolId, trigger: "manual", triggered_by: req.userId ?? null, status: "running" })
    .select("id, started_at")
    .single();
  if (error || !run) {
    res.status(500).json({ error: error?.message ?? "Could not start the send" });
    return;
  }
  let recipients = 0;
  try {
    recipients = (await audienceSummary(schoolId, settings)).parents;
  } catch {
    // counted again inside the run
  }
  // Deliver in the background; the history shows progress.
  void executeRun(run.id as string, schoolId, settings);
  res.status(202).json({ runId: run.id, recipients, startedAt: run.started_at });
});

router.get("/parent-digest/runs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = adminSchool(req, res);
  if (!schoolId) return;
  const { data, error } = await supabaseAdmin
    .from("digest_runs")
    .select("*")
    .eq("school_id", schoolId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) {
    res.json([]);
    return;
  }
  const userIds = Array.from(new Set((data ?? []).map((r) => r.triggered_by as string | null).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: ps } = await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", userIds);
    for (const p of ps ?? []) names.set(p.id as string, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Admin");
  }
  res.json(
    (data ?? []).map((r) => ({
      id: r.id,
      trigger: r.trigger,
      triggeredBy: r.triggered_by,
      triggeredByName: r.triggered_by ? names.get(r.triggered_by) ?? "Admin" : null,
      scheduledFor: r.scheduled_for,
      status: r.status,
      recipients: r.recipients,
      inAppSent: r.in_app_sent,
      emailsSent: r.emails_sent,
      emailsFailed: r.emails_failed,
      skippedOptedOut: r.skipped_opted_out,
      error: r.error,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }))
  );
});

export default router;
