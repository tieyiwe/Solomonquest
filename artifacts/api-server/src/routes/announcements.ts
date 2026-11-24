import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { dispatchNotifications, parentsOfStudents, type AudienceRecipient } from "../lib/notifyAudience";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Course ids whose announcements a non-staff caller may read: the
 *  courses they're actively enrolled in (students/staff) or, for a parent,
 *  their linked children's courses. */
async function readableCourseIds(req: AuthenticatedRequest): Promise<string[]> {
  let studentIds = [req.userId ?? ""];
  if (req.userRole === "parent") {
    const { data: links } = await supabaseAdmin
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", req.userId ?? "");
    studentIds = (links ?? []).map((l) => l.student_id as string);
    if (studentIds.length === 0) return [];
  }
  const { data } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .in("student_id", studentIds)
    .eq("status", "active");
  return Array.from(new Set((data ?? []).map((e) => e.course_id as string)));
}

router.get("/announcements", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  let query = supabaseAdmin
    .from("announcements")
    .select("*")
    .eq("school_id", req.schoolId ?? "")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const isStaff = req.userRole === "admin" || req.userRole === "super_admin" || req.userRole === "teacher";
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;

  if (courseId) {
    // Students only see a course's announcements if they're in the course.
    if (!isStaff && !(await readableCourseIds(req)).includes(courseId)) {
      res.json([]);
      return;
    }
    query = query.eq("course_id", courseId);
  } else if (!isStaff) {
    // No course filter: school-wide announcements plus the caller's own
    // courses' — never every course in the school.
    const ids = await readableCourseIds(req);
    query = ids.length
      ? query.or(`course_id.is.null,course_id.in.(${ids.join(",")})`)
      : query.is("course_id", null);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const announcements = await enrichAnnouncements(data ?? []);
  res.json(announcements);
});

router.post("/announcements", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { title, content, courseId, isPinned } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  // A teacher posts to a course they teach; school-wide announcements are
  // for admins. Previously a teacher could post into any course id (or the
  // whole school), including courses in other schools.
  if (courseId) {
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("school_id, teacher_id")
      .eq("id", courseId)
      .maybeSingle();
    if (!course || (req.userRole !== "super_admin" && course.school_id !== req.schoolId)) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (req.userRole === "teacher" && course.teacher_id !== req.userId) {
      res.status(403).json({ error: "You can only post announcements to courses you teach" });
      return;
    }
  } else if (req.userRole === "teacher") {
    res.status(403).json({ error: "Teachers post announcements to a course" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("announcements")
    .insert({
      school_id: req.schoolId,
      title,
      content: content ?? null,
      course_id: courseId ?? null,
      is_pinned: isPinned ?? false,
      posted_by: req.userId,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Notify the audience in the background — never hold the response on
  // recipient lookups or email delivery.
  notifyAnnouncementAudience({
    announcementId: data.id as string,
    schoolId: (data.school_id as string | null) ?? null,
    courseId: (data.course_id as string | null) ?? null,
    title: String(title),
    content: typeof content === "string" ? content : "",
    authorId: req.userId ?? null,
  }).catch((err) => logger.error({ err }, "announcement notification failed"));

  res.status(201).json(await enrichAnnouncement(data));
});

const ROLE_HOME: Record<string, string> = {
  admin: "/dashboard/admin",
  super_admin: "/dashboard/admin",
  teacher: "/dashboard/teacher",
  student: "/dashboard/student",
  staff: "/dashboard/student",
  parent: "/dashboard/parent",
};

/**
 * Course announcement: the course's actively enrolled students (link to
 * the course page) plus their linked parents (parent dashboard, where the
 * announcements panel lives). School-wide: everyone whose profile is in the
 * school (each to their own dashboard, which shows the announcements
 * panel) plus parents linked to the school's students. The author is never
 * notified; per-user preferences ("announcements") are applied downstream.
 */
async function notifyAnnouncementAudience(a: {
  announcementId: string;
  schoolId: string | null;
  courseId: string | null;
  title: string;
  content: string;
  authorId: string | null;
}): Promise<void> {
  const recipients: AudienceRecipient[] = [];
  let studentIds: string[] = [];
  let heading = "New announcement";

  if (a.courseId) {
    const [{ data: enrollments }, { data: course }] = await Promise.all([
      supabaseAdmin.from("course_enrollments").select("student_id").eq("course_id", a.courseId).eq("status", "active"),
      supabaseAdmin.from("courses").select("title").eq("id", a.courseId).maybeSingle(),
    ]);
    studentIds = (enrollments ?? []).map((e) => e.student_id as string);
    for (const id of studentIds) recipients.push({ userId: id, link: `/dashboard/student/courses/${a.courseId}` });
    if (course?.title) heading = `New announcement in ${course.title}`;
  } else if (a.schoolId) {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: people, error } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("school_id", a.schoolId)
        .range(from, from + PAGE - 1);
      if (error) break;
      for (const p of people ?? []) {
        const role = (p.role as string | null) ?? "student";
        recipients.push({ userId: p.id as string, link: ROLE_HOME[role] ?? "/notifications" });
        if (role === "student") studentIds.push(p.id as string);
      }
      if (!people || people.length < PAGE) break;
    }
  } else {
    return;
  }

  for (const l of await parentsOfStudents(studentIds)) {
    recipients.push({ userId: l.parentId, link: "/dashboard/parent" });
  }

  const body = a.content.length > 300 ? `${a.content.slice(0, 297)}...` : a.content;
  dispatchNotifications({
    recipients,
    type: "announcement",
    category: "announcements",
    title: `${heading}: ${a.title}`,
    body: body || a.title,
    excludeUserId: a.authorId,
    metadata: { announcementId: a.announcementId, courseId: a.courseId },
  });
}

router.delete("/announcements/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data: existing } = await supabaseAdmin
    .from("announcements")
    .select("school_id, posted_by")
    .eq("id", id)
    .single();

  if (!existing) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  if (req.userRole !== "super_admin" && existing.school_id !== req.schoolId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (req.userRole === "teacher" && existing.posted_by !== req.userId) {
    res.status(403).json({ error: "You can only delete your own announcements" });
    return;
  }

  const { error } = await supabaseAdmin.from("announcements").delete().eq("id", id);

  if (error) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  res.sendStatus(204);
});

async function enrichAnnouncement(a: Record<string, unknown>) {
  let postedByName: string | null = null;

  if (a.posted_by) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", a.posted_by as string)
      .single();
    if (profile) {
      postedByName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
    }
  }

  return {
    id: a.id,
    schoolId: a.school_id,
    courseId: a.course_id,
    title: a.title,
    content: a.content,
    isPinned: a.is_pinned,
    postedBy: a.posted_by,
    postedByName,
    createdAt: a.created_at,
  };
}

async function enrichAnnouncements(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [];

  const posterIds = Array.from(
    new Set(rows.filter((a) => a.posted_by).map((a) => a.posted_by as string))
  );

  const { data: profiles } = posterIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", posterIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null])
  );

  return rows.map((a) => ({
    id: a.id,
    schoolId: a.school_id,
    courseId: a.course_id,
    title: a.title,
    content: a.content,
    isPinned: a.is_pinned,
    postedBy: a.posted_by,
    postedByName: a.posted_by ? nameById.get(a.posted_by as string) ?? null : null,
    createdAt: a.created_at,
  }));
}

export default router;
