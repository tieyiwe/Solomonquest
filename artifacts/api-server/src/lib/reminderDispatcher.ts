import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { notifyUsers } from "./notifications";

/**
 * Delivers scheduled reminders. POST /reminders only ever stored a row with
 * a send_at time and `sent = false` — nothing read those rows again, so a
 * reminder an admin or teacher scheduled never reached anyone. This polls
 * for due reminders, claims each one atomically (sent false -> true, so two
 * server instances can't both deliver it), resolves the recipients and
 * sends an in-app notification (plus email, per the user's preferences).
 */
const BATCH = 100;

async function recipientsFor(r: Record<string, unknown>): Promise<string[]> {
  if (r.target_user_id) return [r.target_user_id as string];

  if (r.type === "teacher_to_student" && r.course_id) {
    const { data } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", r.course_id as string)
      .eq("status", "active");
    return (data ?? []).map((e) => e.student_id as string);
  }

  if (r.target_role === "teacher" && r.school_id) {
    // A course-scoped admin reminder goes to that course's teacher only.
    if (r.course_id) {
      const { data: course } = await supabaseAdmin
        .from("courses")
        .select("teacher_id")
        .eq("id", r.course_id as string)
        .maybeSingle();
      return course?.teacher_id ? [course.teacher_id as string] : [];
    }
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("school_id", r.school_id as string)
      .eq("role", "teacher");
    return (data ?? []).map((p) => p.id as string);
  }

  return [];
}

export async function dispatchDueReminders(): Promise<number> {
  const { data: due, error } = await supabaseAdmin
    .from("reminders")
    .select("*")
    .eq("sent", false)
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    logger.error({ err: error }, "[reminders] failed to load due reminders");
    return 0;
  }

  let delivered = 0;
  for (const r of due ?? []) {
    const { data: claimed } = await supabaseAdmin
      .from("reminders")
      .update({ sent: true })
      .eq("id", r.id)
      .eq("sent", false)
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // another instance took it

    try {
      const userIds = await recipientsFor(r);
      if (userIds.length === 0) continue;
      await notifyUsers({
        userIds,
        type: "reminder",
        category: r.type === "teacher_to_student" ? "assignments" : "platform",
        title: "Reminder",
        body: r.message as string,
        link:
          r.type === "teacher_to_student" && r.course_id
            ? `/dashboard/student/courses/${r.course_id}`
            : r.course_id
            ? `/dashboard/teacher/courses/${r.course_id}`
            : undefined,
      });
      delivered++;
    } catch (err) {
      logger.error({ err, reminderId: r.id }, "[reminders] delivery failed");
    }
  }
  return delivered;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startReminderDispatcher(intervalMs = 60_000): void {
  if (timer) return;
  const tick = () => {
    dispatchDueReminders().catch((err) => logger.error({ err }, "[reminders] dispatch tick failed"));
  };
  timer = setInterval(tick, intervalMs);
  // Don't keep the process alive just for this timer.
  timer.unref?.();
  tick();
}
