import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { sendResourceNotification } from "../lib/email";

const router: IRouter = Router({ mergeParams: true });

// GET /courses/:courseId/resources
router.get(
  "/courses/:courseId/resources",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { courseId } = req.params;
    const { section } = req.query;

    let query = supabaseAdmin
      .from("course_resources")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    if (section) {
      query = query.eq("section", section as string);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data ?? []);
  }
);

// POST /courses/:courseId/resources
router.post(
  "/courses/:courseId/resources",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (role !== "teacher" && role !== "admin") {
      res.status(403).json({ error: "Forbidden: teacher or admin only" });
      return;
    }

    const { courseId } = req.params;
    const { title, description, resourceType, fileUrl, externalUrl, section } =
      req.body;

    if (!title || !resourceType) {
      res.status(400).json({ error: "title and resourceType are required" });
      return;
    }

    // Fetch course to get its title for notifications
    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("id, title")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    // Insert the resource
    const { data: resource, error: insertError } = await supabaseAdmin
      .from("course_resources")
      .insert({
        course_id: courseId,
        title,
        description: description ?? null,
        resource_type: resourceType,
        file_url: fileUrl ?? null,
        external_url: externalUrl ?? null,
        section: section ?? null,
        created_by: req.userId,
      })
      .select()
      .single();

    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }

    // Fetch enrolled students
    const { data: enrollments, error: enrollError } = await supabaseAdmin
      .from("enrollments")
      .select("student_id")
      .eq("course_id", courseId)
      .eq("status", "active");

    if (enrollError) {
      console.error("[course-resources] Failed to fetch enrollments:", enrollError.message);
      res.status(201).json(resource);
      return;
    }

    const studentIds = (enrollments ?? []).map((e) => e.student_id as string);

    if (studentIds.length > 0) {
      // Insert in-app notifications for each student
      const notifications = studentIds.map((studentId) => ({
        user_id: studentId,
        title: `New resource in ${course.title}`,
        body: `${title} has been added`,
        link: `/dashboard/student/courses/${courseId}`,
      }));

      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("[course-resources] Failed to insert notifications:", notifError.message);
      }

      // Fetch student auth profiles to get emails
      try {
        const { data: usersPage, error: usersError } =
          await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

        if (usersError) {
          console.error("[course-resources] Failed to list users:", usersError.message);
        } else {
          const userMap = new Map<string, { email: string; name?: string }>();
          for (const u of usersPage.users) {
            userMap.set(u.id, {
              email: u.email ?? "",
              name:
                ((u.user_metadata?.first_name as string | undefined) ?? "") +
                " " +
                ((u.user_metadata?.last_name as string | undefined) ?? ""),
            });
          }

          // Also fetch display names from profiles
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", studentIds);

          const profileMap = new Map<string, string>();
          for (const p of profiles ?? []) {
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
            profileMap.set(p.id as string, name || "Student");
          }

          await Promise.allSettled(
            studentIds.map(async (studentId) => {
              const userInfo = userMap.get(studentId);
              if (!userInfo?.email) return;

              const studentName = profileMap.get(studentId) ?? "Student";

              await sendResourceNotification({
                to: userInfo.email,
                studentName,
                courseTitle: course.title as string,
                resourceTitle: title,
                resourceType,
              });
            })
          );
        }
      } catch (err) {
        console.error("[course-resources] Email notification error:", err);
      }
    }

    res.status(201).json(resource);
  }
);

// DELETE /courses/:courseId/resources/:id
router.delete(
  "/courses/:courseId/resources/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (role !== "teacher" && role !== "admin") {
      res.status(403).json({ error: "Forbidden: teacher or admin only" });
      return;
    }

    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("course_resources")
      .delete()
      .eq("id", id);

    if (error) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    res.sendStatus(204);
  }
);

export default router;
