import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

export type CalendarEventType = "assignment_due" | "video_session" | "reminder";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  courseId: string | null;
  courseTitle: string | null;
  link: string | null;
}

// GET /calendar?start=ISO&end=ISO — a single feed of everything with a date
// on it that's relevant to the caller: assignment due dates, scheduled live
// video sessions, and reminders — previously three separate places with no
// combined view. Scoped by role: a student sees their enrolled courses'
// (published) items, a teacher sees the courses they teach, an admin sees
// the whole school. Defaults to a 30-days-back/60-days-forward window when
// start/end aren't given.
router.get("/calendar", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  const userId = req.userId;
  const schoolId = req.schoolId;

  const startParam = req.query.start as string | undefined;
  const endParam = req.query.end as string | undefined;
  const start = startParam && !isNaN(Date.parse(startParam)) ? new Date(startParam) : new Date(Date.now() - 30 * 86400000);
  const end = endParam && !isNaN(Date.parse(endParam)) ? new Date(endParam) : new Date(Date.now() + 60 * 86400000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Resolve which courses are in scope for this caller.
  let courseIds: string[] = [];
  if (role === "teacher") {
    const { data } = await supabaseAdmin.from("courses").select("id").eq("teacher_id", userId ?? "");
    courseIds = (data ?? []).map((c) => c.id as string);
  } else if (role === "admin" || role === "super_admin") {
    if (!schoolId && role !== "super_admin") {
      res.status(400).json({ error: "No school associated with this account" });
      return;
    }
    let query = supabaseAdmin.from("courses").select("id");
    if (schoolId) query = query.eq("school_id", schoolId);
    const { data } = await query;
    courseIds = (data ?? []).map((c) => c.id as string);
  } else {
    // student / staff: enrolled courses only
    const { data } = await supabaseAdmin
      .from("course_enrollments")
      .select("course_id")
      .eq("student_id", userId ?? "")
      .eq("status", "active");
    courseIds = (data ?? []).map((e) => e.course_id as string);
  }

  const events: CalendarEvent[] = [];

  if (courseIds.length > 0) {
    const isStaffRole = role === "teacher" || role === "admin" || role === "super_admin";

    let assignmentQuery = supabaseAdmin
      .from("assignments")
      .select("id, title, due_date, course_id, courses(title)")
      .in("course_id", courseIds)
      .not("due_date", "is", null)
      .gte("due_date", startIso)
      .lte("due_date", endIso);
    if (!isStaffRole) {
      assignmentQuery = assignmentQuery.eq("is_published", true);
    }

    const [assignmentsRes, videoRes] = await Promise.all([
      assignmentQuery,
      supabaseAdmin
        .from("video_sessions")
        .select("id, title, scheduled_at, course_id, courses(title)")
        .in("course_id", courseIds)
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", startIso)
        .lte("scheduled_at", endIso),
    ]);

    for (const a of assignmentsRes.data ?? []) {
      events.push({
        id: a.id as string,
        type: "assignment_due",
        title: a.title as string,
        date: a.due_date as string,
        courseId: a.course_id as string,
        courseTitle: (a.courses as { title?: string } | null)?.title ?? null,
        link: `/dashboard/${role === "teacher" ? "teacher" : role === "admin" || role === "super_admin" ? "admin" : "student"}/courses/${a.course_id}`,
      });
    }

    for (const v of videoRes.data ?? []) {
      events.push({
        id: v.id as string,
        type: "video_session",
        title: v.title as string,
        date: v.scheduled_at as string,
        courseId: v.course_id as string,
        courseTitle: (v.courses as { title?: string } | null)?.title ?? null,
        link: `/dashboard/${role === "teacher" ? "teacher" : role === "admin" || role === "super_admin" ? "admin" : "student"}/courses/${v.course_id}`,
      });
    }
  }

  // Reminders: an admin sees every reminder in the school. Everyone else
  // sees reminders they created, reminders addressed to them personally, and
  // role-targeted reminders for a course they're in.
  //
  // The personal branch was missing: POST /reminders' main admin path
  // requires target_user_id, but neither the teacher filter (created_by only)
  // nor the student filter (target_role + course_id) ever matched a row with
  // target_user_id set, so a reminder addressed to a specific person was
  // invisible to that person.
  let reminderQuery = supabaseAdmin
    .from("reminders")
    .select("id, message, send_at, target_role, course_id, created_by")
    .not("send_at", "is", null)
    .gte("send_at", startIso)
    .lte("send_at", endIso);

  if (role === "admin" || role === "super_admin") {
    if (schoolId) reminderQuery = reminderQuery.eq("school_id", schoolId);
  } else {
    if (schoolId) reminderQuery = reminderQuery.eq("school_id", schoolId);
    const clauses = [`created_by.eq.${userId ?? ""}`, `target_user_id.eq.${userId ?? ""}`];
    if (courseIds.length > 0) {
      clauses.push(`and(target_role.eq.${role ?? ""},course_id.in.(${courseIds.join(",")}))`);
    }
    reminderQuery = reminderQuery.or(clauses.join(","));
  }

  const { data: reminders } = await reminderQuery;
  for (const r of reminders ?? []) {
    events.push({
      id: r.id as string,
      type: "reminder",
      title: r.message as string,
      date: r.send_at as string,
      courseId: (r.course_id as string | null) ?? null,
      courseTitle: null,
      link: null,
    });
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  res.json(events);
});

export default router;
