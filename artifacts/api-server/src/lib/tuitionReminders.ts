import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { isSmtpConfigured, sendEmailStrict } from "./email";
import { buildReminder, cleanNote, partitionByThrottle, todayUtc, type ReminderContent, type Statement } from "./tuitionLedgerCore";
import { getSchoolPaymentInfo, lastRemindedMap, loadStudentLedgers, type SchoolPaymentInfo } from "./tuitionLedger";
import { reminderEmailHtml, reminderEmailText } from "./tuitionEmails";

/**
 * Balance reminders: one message per student built from their real numbers,
 * sent as an in-app notification plus an email (and optionally to linked
 * parents/guardians). Preferences follow notifyAudience's flat keys
 * (`in_app`, `email`, and a per-type key, here `tuition`); a missing key means
 * on, so tuition reminders are on unless someone turned them off.
 */

export const MAX_REMINDER_BATCH = 500;
const EMAIL_CONCURRENCY = 5;
const EMAIL_PAUSE_MS = 300;

type Prefs = Record<string, unknown> | null | undefined;

export function tuitionPrefAllows(prefs: Prefs, channel: "in_app" | "email"): boolean {
  const p = (prefs ?? {}) as Record<string, unknown>;
  return p[channel] !== false && p.tuition !== false;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  notification_prefs: Prefs;
}

async function loadProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  const out = new Map<string, ProfileRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, notification_prefs")
      .in("id", ids.slice(i, i + 200));
    for (const p of (data ?? []) as ProfileRow[]) out.set(p.id, p);
  }
  return out;
}

async function parentLinks(studentIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("parent_student_links")
      .select("parent_id, student_id")
      .in("student_id", studentIds.slice(i, i + 200));
    if (error) {
      logger.warn({ err: error }, "tuition reminders: parent lookup failed");
      continue;
    }
    for (const l of data ?? []) {
      const list = out.get(l.student_id as string) ?? [];
      list.push(l.parent_id as string);
      out.set(l.student_id as string, list);
    }
  }
  return out;
}

export interface ReminderRequest {
  schoolId: string;
  sentBy: string | null;
  studentIds: string[];
  note?: unknown;
  notifyParents?: boolean;
  override?: boolean;
  now?: Date;
}

interface Prepared {
  school: SchoolPaymentInfo;
  note: string;
  today: string;
  eligible: { studentId: string; statement: Statement }[];
  skippedRecent: string[];
  skippedNoBalance: string[];
  notFound: string[];
}

async function prepare(req: ReminderRequest): Promise<Prepared> {
  const ids = Array.from(new Set(req.studentIds.filter((x) => typeof x === "string" && x))).slice(0, MAX_REMINDER_BATCH);
  const today = todayUtc(req.now);
  const [ledgers, school, reminded] = await Promise.all([
    loadStudentLedgers(req.schoolId, { studentIds: ids, today }),
    getSchoolPaymentInfo(req.schoolId),
    lastRemindedMap(req.schoolId, ids),
  ]);
  const notFound: string[] = [];
  const skippedNoBalance: string[] = [];
  const owing: string[] = [];
  for (const id of ids) {
    const l = ledgers.get(id);
    if (!l) notFound.push(id);
    else if (!l.statement.totals.some((t) => t.outstandingCents > 0)) skippedNoBalance.push(id);
    else owing.push(id);
  }
  const { send, skipped } = partitionByThrottle(owing, reminded, { now: req.now, override: req.override });
  return {
    school,
    note: cleanNote(req.note),
    today,
    eligible: send.map((studentId) => ({ studentId, statement: ledgers.get(studentId)!.statement })),
    skippedRecent: skipped,
    skippedNoBalance,
    notFound,
  };
}

function contentFor(
  prep: Prepared,
  statement: Statement,
  firstName: string,
  childName?: string
): ReminderContent {
  return buildReminder({
    firstName,
    childName,
    schoolName: prep.school.name,
    statement,
    onlinePayments: prep.school.onlinePayments,
    paymentInstructions: prep.school.paymentInstructions,
    note: prep.note,
    today: prep.today,
  });
}

export async function previewReminders(req: ReminderRequest) {
  const prep = await prepare(req);
  let sample: { studentName: string; subject: string; text: string; html: string } | null = null;
  const first = prep.eligible[0];
  if (first) {
    const profiles = await loadProfiles([first.studentId]);
    const p = profiles.get(first.studentId);
    const content = contentFor(prep, first.statement, p?.first_name ?? "");
    sample = {
      studentName: `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Student",
      subject: content.subject,
      // The email shows this as a button; say so instead of a bare path.
      text: content.text.replace(/: \/dashboard\/student\/tuition$/, " (button to their Tuition page)"),
      html: reminderEmailHtml({
        school: { name: prep.school.name, logoUrl: prep.school.logoUrl },
        content,
        today: prep.today,
        note: prep.note,
        paymentInstructions: prep.school.paymentInstructions,
        onlinePayments: prep.school.onlinePayments,
        linkPath: content.linkPath,
      }),
    };
  }
  return {
    eligible: prep.eligible.length,
    skippedRecent: prep.skippedRecent.length,
    skippedNoBalance: prep.skippedNoBalance.length + prep.notFound.length,
    emailEnabled: isSmtpConfigured(),
    onlinePayments: prep.school.onlinePayments,
    sample,
  };
}

export interface ReminderResult {
  studentId: string;
  studentName: string;
  outcome: "sent" | "failed" | "skipped_recent" | "skipped_no_balance";
  channels: string[];
  emailStatus: string | null;
  parentsNotified: number;
  error?: string;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendReminders(req: ReminderRequest) {
  const prep = await prepare(req);
  const smtp = isSmtpConfigured();
  const studentIds = prep.eligible.map((e) => e.studentId);
  const links = req.notifyParents ? await parentLinks(studentIds) : new Map<string, string[]>();
  const parentIds = Array.from(new Set(Array.from(links.values()).flat()));
  const profiles = await loadProfiles([...studentIds, ...parentIds]);

  // Work list: one job per recipient (student, then each parent).
  interface Job {
    studentId: string;
    recipient: ProfileRow;
    isParent: boolean;
    content: ReminderContent;
    linkPath: string;
  }
  const jobs: Job[] = [];
  for (const e of prep.eligible) {
    const student = profiles.get(e.studentId);
    if (!student) continue;
    const studentFirst = student.first_name ?? "";
    jobs.push({ studentId: e.studentId, recipient: student, isParent: false, content: contentFor(prep, e.statement, studentFirst), linkPath: "/dashboard/student/tuition" });
    for (const pid of links.get(e.studentId) ?? []) {
      const parent = profiles.get(pid);
      if (!parent) continue;
      const content = contentFor(prep, e.statement, parent.first_name ?? "", studentFirst || "your student");
      jobs.push({ studentId: e.studentId, recipient: parent, isParent: true, content: { ...content, linkPath: "/dashboard/parent/tuition", text: content.text.replace(/\/dashboard\/student\/tuition$/, "/dashboard/parent/tuition") }, linkPath: "/dashboard/parent/tuition" });
    }
  }

  // In-app notifications in one insert.
  const notifRows = jobs
    .filter((j) => tuitionPrefAllows(j.recipient.notification_prefs, "in_app"))
    .map((j) => ({
      user_id: j.recipient.id,
      type: "tuition_reminder",
      title: j.isParent ? "Tuition balance due for your student" : "Tuition balance due",
      // The notification carries its own link, so drop the trailing
      // "View balance: /path" line from the body.
      body: j.content.text.replace(/\n\n[^\n]*: \/dashboard\/[a-z/]+$/, ""),
      link: j.linkPath,
      metadata: { studentId: j.studentId },
      is_read: false,
    }));
  const inAppOk = new Set<string>();
  for (let i = 0; i < notifRows.length; i += 500) {
    const part = notifRows.slice(i, i + 500);
    const { error } = await supabaseAdmin.from("notifications").insert(part);
    if (error) logger.error({ err: error }, "tuition reminders: notification insert failed");
    else for (const r of part) inAppOk.add(`${r.user_id}:${r.metadata.studentId}`);
  }

  // Emails, a few at a time with a short pause between batches.
  const emailStatus = new Map<string, string>();
  const emailTargets = jobs.filter((j) => {
    const key = `${j.recipient.id}:${j.studentId}`;
    if (!smtp) return emailStatus.set(key, "smtp_off"), false;
    if (!j.recipient.email) return emailStatus.set(key, "no_email"), false;
    if (!tuitionPrefAllows(j.recipient.notification_prefs, "email")) return emailStatus.set(key, "opted_out"), false;
    return true;
  });
  for (let i = 0; i < emailTargets.length; i += EMAIL_CONCURRENCY) {
    const part = emailTargets.slice(i, i + EMAIL_CONCURRENCY);
    await Promise.all(
      part.map(async (j) => {
        const key = `${j.recipient.id}:${j.studentId}`;
        try {
          const html = reminderEmailHtml({
            school: { name: prep.school.name, logoUrl: prep.school.logoUrl },
            content: j.content,
            today: prep.today,
            note: prep.note,
            paymentInstructions: prep.school.paymentInstructions,
            onlinePayments: prep.school.onlinePayments,
            linkPath: j.linkPath,
          });
          await sendEmailStrict(j.recipient.email as string, j.content.subject, html, reminderEmailText(j.content, prep.today, j.linkPath));
          emailStatus.set(key, "sent");
        } catch (err: any) {
          logger.error({ err }, "tuition reminders: email failed");
          emailStatus.set(key, "failed");
        }
      })
    );
    if (i + EMAIL_CONCURRENCY < emailTargets.length) await pause(EMAIL_PAUSE_MS);
  }

  // Per-student results + history rows.
  const results: ReminderResult[] = [];
  const history: Record<string, unknown>[] = [];
  let emailed = 0;
  let parentsNotified = 0;
  for (const e of prep.eligible) {
    const student = profiles.get(e.studentId);
    const name = `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim() || "Student";
    const mine = jobs.filter((j) => j.studentId === e.studentId);
    const own = mine.find((j) => !j.isParent);
    const ownKey = own ? `${own.recipient.id}:${e.studentId}` : "";
    const channels: string[] = [];
    if (own && inAppOk.has(ownKey)) channels.push("in_app");
    const es = own ? emailStatus.get(ownKey) ?? null : "no_email";
    if (es === "sent") channels.push("email");
    let pCount = 0;
    for (const j of mine.filter((x) => x.isParent)) {
      const k = `${j.recipient.id}:${e.studentId}`;
      if (inAppOk.has(k) || emailStatus.get(k) === "sent") pCount += 1;
      if (emailStatus.get(k) === "sent") emailed += 1;
    }
    if (es === "sent") emailed += 1;
    parentsNotified += pCount;
    const failed = !own || es === "failed" || (channels.length === 0 && pCount === 0);
    results.push({
      studentId: e.studentId,
      studentName: name,
      outcome: failed ? "failed" : "sent",
      channels,
      emailStatus: es,
      parentsNotified: pCount,
      error: !own ? "Student profile not found" : es === "failed" ? "Email could not be sent" : channels.length === 0 && pCount === 0 ? "Notifications are turned off for this student" : undefined,
    });
    if (channels.length || pCount) {
      const st = e.statement;
      history.push({
        school_id: req.schoolId,
        student_id: e.studentId,
        sent_by: req.sentBy,
        channels: [...channels, ...(pCount ? ["parents"] : [])],
        email_status: es,
        parents_notified: pCount,
        balance_cents: st.primary.outstandingCents,
        overdue_cents: st.primary.overdueCents,
        currency: st.primaryCurrency,
        balances: st.totals.map((t) => ({ currency: t.currency, outstandingCents: t.outstandingCents, overdueCents: t.overdueCents })),
        items: (own?.content.lines ?? []).map((l) => ({ ...l })),
        custom_note: prep.note || null,
        message: own?.content.text ?? "",
      });
    }
  }
  if (history.length) {
    const { error } = await supabaseAdmin.from("tuition_reminders").insert(history);
    if (error) logger.error({ err: error }, "tuition reminders: history insert failed (run tuition-ledger.sql)");
  }
  for (const id of prep.skippedRecent) results.push({ studentId: id, studentName: "", outcome: "skipped_recent", channels: [], emailStatus: null, parentsNotified: 0 });

  const sent = results.filter((r) => r.outcome === "sent").length;
  return {
    requested: req.studentIds.length,
    sent,
    emailed,
    inApp: inAppOk.size,
    parentsNotified,
    failed: results.filter((r) => r.outcome === "failed").length,
    skippedRecent: prep.skippedRecent.length,
    skippedNoBalance: prep.skippedNoBalance.length + prep.notFound.length,
    emailEnabled: smtp,
    results,
  };
}
