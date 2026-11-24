import { baseLayout, escapeHtml } from "./email";
import type { RiskFlag, RiskThresholds, StudentMetrics, WorkItem } from "./studentProgress";

/**
 * Parent progress digest: the content model, the pure building blocks
 * (grouping, preferences, status cues, message sanitising, rate limits)
 * and the email / in-app renderers. No database access here, so all of it
 * is unit-tested directly; lib/parentDigest.ts does the I/O.
 */

export type Tone = "green" | "amber" | "red";

export interface DigestToggles {
  grades: boolean;
  attendance: boolean;
  missingLate: boolean;
  completion: boolean;
  upcoming: boolean;
  announcements: boolean;
}

export const DEFAULT_TOGGLES: DigestToggles = {
  grades: true,
  attendance: true,
  missingLate: true,
  completion: true,
  upcoming: true,
  announcements: true,
};

export const MESSAGE_MAX = 1000;

export interface DigestCourseLine {
  courseId: string;
  title: string;
  gradePercent: number | null;
  letterGrade: string | null;
  tone: Tone | null;
  toneLabel: string | null;
  completionPercent: number | null;
}

export interface DigestWorkLine {
  title: string;
  courseTitle: string | null;
  dueDate: string | null;
}

export interface DigestChildSection {
  studentId: string;
  firstName: string;
  fullName: string;
  tone: Tone;
  statusLabel: string;
  /** Plain-language reasons behind an amber/red status. */
  reasons: string[];
  averageGrade: number | null;
  /** Present when grades and/or completion are on. */
  courses?: DigestCourseLine[];
  attendance?: { percent: number | null; present: number; absent: number; late: number; total: number; tone: Tone | null; toneLabel: string | null };
  missing?: DigestWorkLine[];
  late?: DigestWorkLine[];
  upcoming?: DigestWorkLine[];
  /** App path of the full report, e.g. /reports/students/<id>. */
  reportPath: string;
}

export interface DigestAnnouncement {
  title: string;
  courseTitle: string | null;
  createdAt: string;
}

export interface ParentDigest {
  parentId: string;
  parentFirstName: string;
  schoolName: string;
  schoolLogoUrl: string | null;
  timezone: string;
  periodLabel: string;
  message: string | null;
  toggles: DigestToggles;
  children: DigestChildSection[];
  announcements?: DigestAnnouncement[];
}

// ─── Grouping & preferences ─────────────────────────────────────────────────

/**
 * One entry per parent with every one of their children that is in scope
 * (a student of this school), de-duplicated and in a stable order.
 */
export function groupChildrenByParent(
  links: { parentId: string; studentId: string }[],
  inScope: Set<string>
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const l of links) {
    if (!l.parentId || !inScope.has(l.studentId)) continue;
    const list = out.get(l.parentId) ?? [];
    if (!list.includes(l.studentId)) list.push(l.studentId);
    out.set(l.parentId, list);
  }
  return out;
}

type Prefs = Record<string, unknown> | null | undefined;

/** The digest category defaults to on; only an explicit `digest: false` opts out. */
export function digestAllowed(prefs: Prefs): boolean {
  return (prefs ?? {}).digest !== false;
}

/**
 * How a parent who has NOT opted out of the digest receives it: the in-app
 * notification always; the email only when they allow email, have an
 * address and SMTP is configured.
 */
export function digestChannels(prefs: Prefs, hasEmail: boolean, smtpConfigured: boolean): { inApp: boolean; email: boolean } {
  if (!digestAllowed(prefs)) return { inApp: false, email: false };
  return { inApp: true, email: smtpConfigured && hasEmail && (prefs ?? {}).email !== false };
}

export function partitionByOptOut<T extends { notification_prefs?: unknown }>(profiles: T[]): { deliver: T[]; optedOut: T[] } {
  const deliver: T[] = [];
  const optedOut: T[] = [];
  for (const p of profiles) (digestAllowed(p.notification_prefs as Prefs) ? deliver : optedOut).push(p);
  return { deliver, optedOut };
}

// ─── School message ─────────────────────────────────────────────────────────

/**
 * Normalises the optional personal message: plain text only, trimmed,
 * control characters removed (newlines kept), at most MESSAGE_MAX chars.
 * Returns null for empty, or an error string when too long / not text.
 */
export function sanitizeMessage(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "message must be text" };
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length > MESSAGE_MAX) return { ok: false, error: `message must be ${MESSAGE_MAX} characters or fewer` };
  return { ok: true, value: cleaned || null };
}

/** HTML for the message: escaped, newlines as <br/>. */
export function messageHtml(message: string): string {
  return escapeHtml(message).replace(/\n/g, "<br/>");
}

// ─── Status cues ────────────────────────────────────────────────────────────

export const TONE_LABEL: Record<Tone, string> = {
  green: "On track",
  amber: "Worth a look",
  red: "Needs attention",
};

export function gradeTone(percent: number | null, t: RiskThresholds): { tone: Tone | null; label: string | null } {
  if (percent === null) return { tone: null, label: null };
  if (percent < t.minGradePercent) return { tone: "red", label: "Below target" };
  if (percent < t.minGradePercent + 10) return { tone: "amber", label: "Close to target" };
  return { tone: "green", label: "Doing well" };
}

export function attendanceTone(percent: number | null, t: RiskThresholds): { tone: Tone | null; label: string | null } {
  if (percent === null) return { tone: null, label: null };
  if (percent < t.minAttendancePercent) return { tone: "red", label: "Below target" };
  if (percent < Math.min(100, t.minAttendancePercent + 10)) return { tone: "amber", label: "A few absences" };
  return { tone: "green", label: "Great attendance" };
}

function friendlyFlag(f: RiskFlag, firstName: string): string {
  switch (f.rule) {
    case "grade":
      return `${firstName}'s average grade is below the school's target. ${f.label}.`;
    case "attendance":
      return `${firstName} has missed some classes. ${f.label}.`;
    case "missing_late":
      return `${firstName} has some missing or late work. ${f.label}.`;
    case "inactive":
      return `${firstName} hasn't signed in for a while. ${f.label}.`;
  }
}

/** Overall cue from the at-risk rules, counting only rules whose section is shown. */
export function childStatus(flags: RiskFlag[], toggles: DigestToggles, firstName: string): { tone: Tone; label: string; reasons: string[] } {
  const relevant = flags.filter(
    (f) =>
      (f.rule === "grade" && toggles.grades) ||
      (f.rule === "attendance" && toggles.attendance) ||
      (f.rule === "missing_late" && toggles.missingLate) ||
      f.rule === "inactive"
  );
  const tone: Tone = relevant.length === 0 ? "green" : relevant.length === 1 ? "amber" : "red";
  return { tone, label: TONE_LABEL[tone], reasons: relevant.map((f) => friendlyFlag(f, firstName)) };
}

// ─── Building one child's section ───────────────────────────────────────────

const workLine = (w: WorkItem): DigestWorkLine => ({ title: w.title, courseTitle: w.courseTitle, dueDate: w.dueDate });

export function buildChildSection(input: {
  studentId: string;
  firstName: string;
  lastName: string;
  metrics: StudentMetrics | undefined;
  flags: RiskFlag[];
  thresholds: RiskThresholds;
  toggles: DigestToggles;
  upcoming: DigestWorkLine[];
  maxItems?: number;
}): DigestChildSection {
  const { metrics: m, toggles, thresholds } = input;
  const max = input.maxItems ?? 5;
  const firstName = input.firstName || "Your child";
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ") || "Your child";
  const status = childStatus(input.flags, toggles, firstName);
  const section: DigestChildSection = {
    studentId: input.studentId,
    firstName,
    fullName,
    tone: status.tone,
    statusLabel: status.label,
    reasons: status.reasons,
    averageGrade: toggles.grades ? m?.averageGrade ?? null : null,
    reportPath: `/reports/students/${input.studentId}`,
  };
  if (toggles.grades || toggles.completion) {
    section.courses = (m?.courses ?? []).map((c) => {
      const g = toggles.grades ? gradeTone(c.gradePercent, thresholds) : { tone: null, label: null };
      return {
        courseId: c.courseId,
        title: c.courseTitle,
        gradePercent: toggles.grades ? c.gradePercent : null,
        letterGrade: toggles.grades ? c.letterGrade : null,
        tone: g.tone,
        toneLabel: g.label,
        completionPercent: toggles.completion ? c.completionPercent : null,
      };
    });
  }
  if (toggles.attendance) {
    const a = m?.attendance ?? { present: 0, absent: 0, late: 0, total: 0, percent: null };
    const t = attendanceTone(a.percent, thresholds);
    section.attendance = { percent: a.percent, present: a.present, absent: a.absent, late: a.late, total: a.total, tone: t.tone, toneLabel: t.label };
  }
  if (toggles.missingLate) {
    section.missing = (m?.missing ?? []).slice(0, max).map(workLine);
    section.late = (m?.late ?? []).slice(0, max).map(workLine);
  }
  if (toggles.upcoming) section.upcoming = input.upcoming.slice(0, max);
  return section;
}

// ─── Copy helpers ───────────────────────────────────────────────────────────

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "your child";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function digestHeadline(d: ParentDigest): string {
  const names = d.children.map((c) => c.firstName);
  if (names.length === 0) return `Your progress update from ${d.schoolName}`;
  return `Here's how ${joinNames(names)} ${names.length === 1 ? "is" : "are"} doing ${d.periodLabel}`;
}

export function digestSubject(d: ParentDigest): string {
  return `${d.schoolName}: ${digestHeadline(d)}`;
}

function fmtDate(iso: string | null, tz: string): string {
  if (!iso) return "no due date";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 10) / 10}%`);

// ─── In-app version ─────────────────────────────────────────────────────────

/**
 * The bell notification: short plain text (the notifications list shows it
 * as-is). Links to the child's progress report, or the parent dashboard
 * when there are several children.
 */
export function renderDigestInApp(d: ParentDigest): { title: string; body: string; link: string } {
  const lines: string[] = [];
  for (const c of d.children) {
    const bits = [`${c.firstName}: ${c.statusLabel}`];
    if (c.averageGrade !== null) bits.push(`average grade ${pct(c.averageGrade)}`);
    if (c.attendance && c.attendance.percent !== null) bits.push(`attendance ${pct(c.attendance.percent)}`);
    if (c.missing) bits.push(`${c.missing.length} missing`);
    if (c.upcoming) bits.push(`${c.upcoming.length} due in the next 7 days`);
    lines.push(bits.join(" · "));
  }
  if (d.message) lines.push(`Message from ${d.schoolName}: ${d.message.length > 200 ? d.message.slice(0, 197) + "…" : d.message}`);
  return {
    title: digestHeadline(d),
    body: lines.join("\n") || `Your update from ${d.schoolName}.`,
    link: d.children.length === 1 ? d.children[0].reportPath : "/dashboard/parent",
  };
}

// ─── Email version ──────────────────────────────────────────────────────────

const TONE_STYLE: Record<Tone, { bg: string; fg: string; border: string; mark: string }> = {
  // Text colours are dark enough for WCAG AA on their tint.
  green: { bg: "#e8f5ec", fg: "#14532d", border: "#16a34a", mark: "&#10003;" },
  amber: { bg: "#fdf3dc", fg: "#713f12", border: "#d97706", mark: "!" },
  red: { bg: "#fde8e8", fg: "#7f1d1d", border: "#dc2626", mark: "&#10007;" },
};

function pill(tone: Tone | null, label: string | null): string {
  if (!tone || !label) return `<span style="color:#888888;font-size:13px;">—</span>`;
  const s = TONE_STYLE[tone];
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${s.bg};color:${s.fg};border:1px solid ${s.border};font-size:12px;font-weight:bold;line-height:1.5;">${s.mark} ${escapeHtml(label)}</span>`;
}

const H3 = (t: string) => `<h3 style="margin:20px 0 8px;color:#141d33;font-size:15px;font-weight:bold;">${t}</h3>`;
const P = (t: string, extra = "") => `<p style="margin:0 0 10px;color:#444444;font-size:14px;line-height:1.6;${extra}">${t}</p>`;

function workList(items: DigestWorkLine[], tz: string, prefix: string): string {
  return `<ul style="margin:0 0 8px;padding-left:20px;color:#444444;font-size:14px;line-height:1.6;">${items
    .map(
      (w) =>
        `<li><strong>${escapeHtml(w.title)}</strong>${w.courseTitle ? ` · ${escapeHtml(w.courseTitle)}` : ""} <span style="color:#666666;">(${prefix} ${escapeHtml(fmtDate(w.dueDate, tz))})</span></li>`
    )
    .join("")}</ul>`;
}

function childHtml(c: DigestChildSection, d: ParentDigest, appUrl: string): string {
  const s = TONE_STYLE[c.tone];
  const parts: string[] = [];
  parts.push(`<table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;"><h2 style="margin:0;color:#141d33;font-size:18px;">${escapeHtml(c.fullName)}</h2></td>
    <td style="vertical-align:middle;text-align:right;">${pill(c.tone, c.statusLabel)}</td>
  </tr></table>`);
  if (c.reasons.length) {
    parts.push(`<ul style="margin:10px 0 0;padding-left:20px;color:#444444;font-size:14px;line-height:1.6;">${c.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`);
  } else {
    parts.push(P(`${escapeHtml(c.firstName)} is on track. Nice work!`, "margin-top:10px;"));
  }

  if (c.courses) {
    const showGrade = d.toggles.grades;
    const showCompletion = d.toggles.completion && c.courses.some((x) => x.completionPercent !== null);
    if (c.courses.length === 0) {
      parts.push(H3("Courses") + P(`${escapeHtml(c.firstName)} isn't enrolled in any courses yet.`));
    } else if (showGrade || showCompletion) {
      const th = (t: string, align = "left") => `<th style="text-align:${align};padding:8px 6px;border-bottom:2px solid #e5e5e5;color:#666666;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${t}</th>`;
      const td = (t: string, align = "left") => `<td style="text-align:${align};padding:8px 6px;border-bottom:1px solid #f0f0f0;color:#333333;font-size:14px;">${t}</td>`;
      const head = `<tr>${th("Course")}${showGrade ? th("Grade") : ""}${showCompletion ? th("Completed", "right") : ""}</tr>`;
      const rows = c.courses
        .map(
          (x) =>
            `<tr>${td(escapeHtml(x.title))}${
              showGrade
                ? td(
                    x.gradePercent === null
                      ? `<span style="color:#666666;">No grades yet</span>`
                      : `<strong>${pct(x.gradePercent)}</strong>${x.letterGrade ? ` (${escapeHtml(x.letterGrade)})` : ""}<br/>${pill(x.tone, x.toneLabel)}`
                  )
                : ""
            }${showCompletion ? td(x.completionPercent === null ? "—" : `${x.completionPercent}%`, "right") : ""}</tr>`
        )
        .join("");
      parts.push(H3(showGrade ? "Grades by course" : "Course progress") + `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${head}${rows}</table>`);
      if (showGrade && c.averageGrade !== null) parts.push(P(`Average across courses: <strong>${pct(c.averageGrade)}</strong>`, "margin-top:8px;"));
    }
  }

  if (c.attendance) {
    const a = c.attendance;
    parts.push(
      H3("Attendance") +
        (a.total === 0
          ? P("No attendance has been taken yet.")
          : P(`<strong>${pct(a.percent)}</strong> &nbsp;${pill(a.tone, a.toneLabel)}<br/><span style="color:#666666;">${a.present} present · ${a.late} late · ${a.absent} absent (${a.total} sessions)</span>`))
    );
  }

  if (c.missing && c.late) {
    parts.push(H3("Missing and late work"));
    if (c.missing.length === 0 && c.late.length === 0) parts.push(P("Nothing missing or late. Great job!"));
    if (c.missing.length) parts.push(P(`<strong>Missing (${c.missing.length})</strong>`, "margin-bottom:4px;") + workList(c.missing, d.timezone, "was due"));
    if (c.late.length) parts.push(P(`<strong>Handed in late (${c.late.length})</strong>`, "margin-bottom:4px;") + workList(c.late, d.timezone, "was due"));
  }

  if (c.upcoming) {
    parts.push(H3("Coming up in the next 7 days"));
    parts.push(c.upcoming.length ? workList(c.upcoming, d.timezone, "due") : P("Nothing due in the next 7 days."));
  }

  const url = escapeHtml(`${appUrl}${c.reportPath}`);
  parts.push(
    `<p style="margin:18px 0 0;"><a href="${url}" style="display:inline-block;padding:10px 22px;background:#141d33;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;">View ${escapeHtml(c.firstName)}'s full progress report</a></p>`
  );
  return `<div style="margin:0 0 24px;padding:16px 14px;border:1px solid #eeeeee;border-left:5px solid ${s.border};border-radius:6px;">${parts.join("")}</div>`;
}

export function renderDigestEmail(d: ParentDigest, appUrl: string): { subject: string; html: string } {
  const base = appUrl.replace(/\/+$/, "");
  const subject = digestSubject(d);
  const school = escapeHtml(d.schoolName);
  const body: string[] = [];
  body.push(`<h1 style="margin:0 0 12px;color:#141d33;font-size:22px;font-weight:bold;">${escapeHtml(digestHeadline(d))}</h1>`);
  body.push(P(`Hi ${escapeHtml(d.parentFirstName || "there")}, here's your progress update from <strong>${school}</strong>.`));
  if (d.message) {
    body.push(
      `<div style="margin:16px 0 22px;padding:14px 16px;background:#f7f5ef;border-left:4px solid #84602a;border-radius:0 4px 4px 0;"><p style="margin:0 0 6px;color:#84602a;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">A message from ${school}</p><p style="margin:0;color:#333333;font-size:14px;line-height:1.6;">${messageHtml(d.message)}</p></div>`
    );
  }
  if (d.children.length === 0) body.push(P("There's nothing to report right now."));
  for (const c of d.children) body.push(childHtml(c, d, base));

  if (d.announcements) {
    body.push(H3("Recent announcements"));
    body.push(
      d.announcements.length
        ? `<ul style="margin:0 0 8px;padding-left:20px;color:#444444;font-size:14px;line-height:1.6;">${d.announcements
            .map((a) => `<li><strong>${escapeHtml(a.title)}</strong> <span style="color:#666666;">· ${a.courseTitle ? escapeHtml(a.courseTitle) : "School-wide"} · ${escapeHtml(fmtDate(a.createdAt, d.timezone))}</span></li>`)
            .join("")}</ul>`
        : P("No new announcements.")
    );
  }

  body.push(
    `<p style="margin:28px 0 0;color:#888888;font-size:12px;line-height:1.6;">You're getting this digest because ${school} sends progress updates to parents. To stop it, turn off "Progress digest" in your <a href="${escapeHtml(`${base}/settings/notifications`)}" style="color:#84602a;">notification settings</a>.</p>`
  );

  return {
    subject,
    html: baseLayout(subject, body.join("\n"), { headerTitle: school, headerLogoUrl: d.schoolLogoUrl ?? undefined }),
  };
}

// ─── Rate limits ────────────────────────────────────────────────────────────

/** In-memory sliding window: at most `max` hits per key per `windowMs`. */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}

  /** Records a hit and returns true, or returns false (and the wait) when over the limit. */
  take(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs: recent[0] + this.windowMs - now };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true };
  }
}

export const SEND_NOW_INTERVAL_MS = 10 * 60_000;
export const TEST_EMAILS_PER_HOUR = 5;

/** ms until "Send now" is allowed again for a school (0 = allowed). */
export function sendNowRetryAfterMs(lastManualSendAt: string | Date | null | undefined, now = Date.now()): number {
  if (!lastManualSendAt) return 0;
  const last = new Date(lastManualSendAt).getTime();
  if (!Number.isFinite(last)) return 0;
  return Math.max(0, last + SEND_NOW_INTERVAL_MS - now);
}
