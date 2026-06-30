import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// POST /courses/:courseId/video/start — teacher/admin starts a video session
router.post(
  "/courses/:courseId/video/start",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { courseId } = req.params;
    const userId = req.userId ?? "";
    const userRole = req.userRole ?? "";

    if (userRole !== "teacher" && userRole !== "admin") {
      res.status(403).json({ error: "Only teachers or admins can start a video session" });
      return;
    }

    // Check no active session already exists for this course
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("video_sessions")
      .select("id")
      .eq("course_id", courseId)
      .eq("is_active", true)
      .maybeSingle();

    if (existingError) {
      res.status(500).json({ error: existingError.message });
      return;
    }

    if (existing) {
      res.status(409).json({ error: "A video session is already active for this course" });
      return;
    }

    // Fetch course title for notification
    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const roomId = `solomonquest-${courseId}-${Date.now()}`;

    // Insert into video_sessions table
    const { data: session, error: insertError } = await supabaseAdmin
      .from("video_sessions")
      .insert({
        course_id: courseId,
        room_id: roomId,
        started_by: userId,
        is_active: true,
      })
      .select()
      .single();

    if (insertError || !session) {
      res.status(500).json({ error: insertError?.message ?? "Failed to create video session" });
      return;
    }

    // Get all enrolled students in the course
    const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
      .from("enrollments")
      .select("user_id")
      .eq("course_id", courseId)
      .eq("status", "active");

    if (enrollmentsError) {
      // Non-fatal: session created, but notifications may not be sent
      console.error("Failed to fetch enrollments for notifications:", enrollmentsError.message);
    }

    const students = enrollments ?? [];

    if (students.length > 0) {
      const notifications = students.map((enrollment: { user_id: string }) => ({
        user_id: enrollment.user_id,
        title: `Live class started in ${course.title}`,
        body: "Your teacher has started a live video session. Click to join.",
        link: `/dashboard/student/courses/${courseId}/video`,
        is_read: false,
      }));

      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("Failed to send notifications:", notifError.message);
      }
    }

    res.status(201).json({
      sessionId: session.id,
      roomId,
      jitsiUrl: `https://meet.jit.si/${roomId}`,
    });
  }
);

// DELETE /courses/:courseId/video/end — teacher/admin ends a session
router.delete(
  "/courses/:courseId/video/end",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { courseId } = req.params;
    const userRole = req.userRole ?? "";

    if (userRole !== "teacher" && userRole !== "admin") {
      res.status(403).json({ error: "Only teachers or admins can end a video session" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("video_sessions")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("course_id", courseId)
      .eq("is_active", true)
      .select()
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: "No active video session found for this course" });
      return;
    }

    res.sendStatus(204);
  }
);

// GET /courses/:courseId/video/active — get active session if any
router.get(
  "/courses/:courseId/video/active",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { courseId } = req.params;
    const userId = req.userId ?? "";
    const userRole = req.userRole ?? "";

    // Verify the requester is either the teacher/admin or an enrolled student
    if (userRole !== "teacher" && userRole !== "admin") {
      const { data: enrollment, error: enrollError } = await supabaseAdmin
        .from("enrollments")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (enrollError) {
        res.status(500).json({ error: enrollError.message });
        return;
      }

      if (!enrollment) {
        res.status(403).json({ error: "You are not enrolled in this course" });
        return;
      }
    }

    const { data: session, error } = await supabaseAdmin
      .from("video_sessions")
      .select("id, course_id, room_id, started_by, is_active, started_at, ended_at")
      .eq("course_id", courseId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!session) {
      res.json(null);
      return;
    }

    res.json({
      sessionId: session.id,
      courseId: session.course_id,
      roomId: session.room_id,
      startedBy: session.started_by,
      isActive: session.is_active,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      jitsiUrl: `https://meet.jit.si/${session.room_id}`,
    });
  }
);

export default router;
