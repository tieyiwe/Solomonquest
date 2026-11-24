import { supabaseAdmin } from "./supabase";
import { sendGenericNotificationEmail, isSmtpConfigured } from "./email";
import { logger } from "./logger";

/**
 * Fan-out notifications (announcements, grades, released quiz scores,
 * extensions) to a potentially large audience, honouring each recipient's
 * stored preferences (profiles.notification_prefs, flat keys):
 *
 *   in_app   (global in-app toggle)   email (global email toggle)
 *   <category> (per-type toggle, e.g. "announcements", "grades")
 *
 * A missing key means "on". In-app rows are written only when in_app and
 * the category are on; emails only when SMTP is configured and email and
 * the category are on. Rows are inserted in batches, and emails are sent
 * with a small concurrency cap.
 *
 * Callers should NOT await this from a request handler. Use
 * `dispatchNotifications(...)`, which runs it in the background and logs
 * failures, so the HTTP response never waits on email delivery.
 */

// "digest" = the parent progress digest (lib/parentDigest.ts uses digestChannels,
// which follows the same rules: a missing key means on).
export type AudienceCategory = "announcements" | "grades" | "assignments" | "digest";

export interface AudienceRecipient {
  userId: string;
  /** In-app path the notification opens, e.g. /dashboard/student/assignments */
  link: string;
}

export interface AudienceNotification {
  recipients: AudienceRecipient[];
  type: string;
  category: AudienceCategory;
  title: string;
  body: string;
  /** Never notify this user (the author / actor). */
  excludeUserId?: string | null;
  metadata?: Record<string, unknown>;
}

const APP_URL = process.env.APP_URL ?? process.env.FRONTEND_URL ?? "https://app.solomonquest.com";
const ID_CHUNK = 200;
const INSERT_CHUNK = 500;
const EMAIL_CONCURRENCY = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function prefAllows(prefs: unknown, channel: "in_app" | "email", category: AudienceCategory): boolean {
  const p = (prefs ?? {}) as Record<string, unknown>;
  return p[channel] !== false && p[category] !== false;
}

export async function notifyAudience(n: AudienceNotification): Promise<{ inApp: number; emailed: number }> {
  // De-duplicate (first link wins), drop the author.
  const linkById = new Map<string, string>();
  for (const r of n.recipients) {
    if (!r.userId || r.userId === n.excludeUserId) continue;
    if (!linkById.has(r.userId)) linkById.set(r.userId, r.link);
  }
  const ids = Array.from(linkById.keys());
  if (ids.length === 0) return { inApp: 0, emailed: 0 };

  const profiles: { id: string; first_name: string | null; last_name: string | null; email: string | null; notification_prefs: unknown }[] = [];
  for (const part of chunk(ids, ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, notification_prefs")
      .in("id", part);
    if (error) {
      logger.error({ err: error }, "notifyAudience: profile lookup failed");
      continue;
    }
    profiles.push(...((data ?? []) as typeof profiles));
  }

  const rows = profiles
    .filter((p) => prefAllows(p.notification_prefs, "in_app", n.category))
    .map((p) => ({
      user_id: p.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: linkById.get(p.id) ?? null,
      metadata: n.metadata ?? {},
      is_read: false,
    }));

  let inApp = 0;
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const { error } = await supabaseAdmin.from("notifications").insert(part);
    if (error) logger.error({ err: error }, "notifyAudience: notification insert failed");
    else inApp += part.length;
  }

  let emailed = 0;
  if (isSmtpConfigured()) {
    const emailTargets = profiles.filter((p) => p.email && prefAllows(p.notification_prefs, "email", n.category));
    for (const part of chunk(emailTargets, EMAIL_CONCURRENCY)) {
      await Promise.all(
        part.map(async (p) => {
          try {
            // sendGenericNotificationEmail escapes every interpolated value
            // (escapeHtml) — title/body carry user-written text.
            await sendGenericNotificationEmail({
              to: p.email as string,
              recipientName: [p.first_name, p.last_name].filter(Boolean).join(" ") || "there",
              title: n.title,
              body: n.body,
              link: linkById.get(p.id),
              appUrl: APP_URL,
            });
            emailed += 1;
          } catch (err) {
            logger.error({ err }, "notifyAudience: email failed");
          }
        })
      );
    }
  }

  return { inApp, emailed };
}

/** Fire-and-forget wrapper for request handlers. */
export function dispatchNotifications(n: AudienceNotification): void {
  notifyAudience(n).catch((err) => logger.error({ err }, "notifyAudience failed"));
}

/** Parent ids linked to each of these students (parent_student_links). */
export async function parentsOfStudents(studentIds: string[]): Promise<{ parentId: string; studentId: string }[]> {
  const unique = Array.from(new Set(studentIds.filter(Boolean)));
  const out: { parentId: string; studentId: string }[] = [];
  for (const part of chunk(unique, ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("parent_student_links")
      .select("parent_id, student_id")
      .in("student_id", part);
    if (error) {
      // parent-portal.sql not applied — no parents to notify.
      logger.warn({ err: error }, "parentsOfStudents lookup failed");
      continue;
    }
    for (const l of data ?? []) out.push({ parentId: l.parent_id as string, studentId: l.student_id as string });
  }
  return out;
}

/** Where a parent lands for news about one child: that child's progress report. */
export function parentLinkForChild(studentId: string): string {
  return `/reports/students/${studentId}`;
}

/**
 * Student + linked parents for a grade-type event. Students get
 * `studentLink`; parents get their child's progress report.
 */
export async function studentAndParentRecipients(
  studentIds: string[],
  studentLink: (studentId: string) => string
): Promise<AudienceRecipient[]> {
  const recipients: AudienceRecipient[] = studentIds.map((id) => ({ userId: id, link: studentLink(id) }));
  for (const l of await parentsOfStudents(studentIds)) {
    recipients.push({ userId: l.parentId, link: parentLinkForChild(l.studentId) });
  }
  return recipients;
}
