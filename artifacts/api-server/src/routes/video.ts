import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Zoom Integration Placeholder ────────────────────────────────────────────
// To activate Zoom: set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in env.
// Then implement generateZoomMeeting() using the Zoom Server-to-Server OAuth API:
//   POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=...
//   POST https://api.zoom.us/v2/users/me/meetings { topic, type: 2, duration }
//   Returns: { join_url, start_url, id }
// Replace the ZOOM_PLACEHOLDER functions below with real calls.

const ZOOM_ENABLED = !!(
  process.env.ZOOM_ACCOUNT_ID &&
  process.env.ZOOM_CLIENT_ID &&
  process.env.ZOOM_CLIENT_SECRET
);

async function generateZoomMeeting(_topic: string): Promise<{ joinUrl: string; startUrl: string; meetingId: string } | null> {
  if (!ZOOM_ENABLED) return null;
  // TODO: implement Zoom Server-to-Server OAuth + create meeting API call here
  // Example:
  // const token = await getZoomAccessToken();
  // const meeting = await createZoomMeeting(token, topic);
  // return { joinUrl: meeting.join_url, startUrl: meeting.start_url, meetingId: String(meeting.id) };
  return null;
}

async function getZoomMeetingStatus(_meetingId: string): Promise<"active" | "ended" | "unknown"> {
  if (!ZOOM_ENABLED) return "unknown";
  // TODO: GET https://api.zoom.us/v2/meetings/:meetingId
  return "unknown";
}

// POST /courses/:courseId/video/start — teacher/admin starts a video session
// Body: { provider?: "jitsi" | "zoom" }  (defaults to "jitsi")
router.post(
  "/courses/:courseId/video/start",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { courseId } = req.params;
    const userId = req.userId ?? "";
    const userRole = req.userRole ?? "";
    const provider: "jitsi" | "zoom" = (req.body as { provider?: "jitsi" | "zoom" }).provider ?? "jitsi";

    if (userRole !== "teacher" && userRole !== "admin") {
      res.status(403).json({ error: "Only teachers or admins can start a video session" });
      return;
    }

    if (provider === "zoom" && !ZOOM_ENABLED) {
      res.status(503).json({ error: "Zoom integration is not configured. Please add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET to environment variables." });
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

    // Resolve meeting URL based on provider
    let joinUrl: string;
    let startUrl: string | null = null;
    let zoomMeetingId: string | null = null;

    if (provider === "zoom") {
      const zoomMeeting = await generateZoomMeeting(course.title as string);
      if (!zoomMeeting) {
        res.status(500).json({ error: "Failed to create Zoom meeting" });
        return;
      }
      joinUrl = zoomMeeting.joinUrl;
      startUrl = zoomMeeting.startUrl;
      zoomMeetingId = zoomMeeting.meetingId;
    } else {
      joinUrl = `https://meet.jit.si/${roomId}`;
    }

    // Insert into video_sessions table
    const { data: session, error: insertError } = await supabaseAdmin
      .from("video_sessions")
      .insert({
        course_id: courseId,
        room_id: roomId,
        started_by: userId,
        is_active: true,
        provider,
        join_url: joinUrl,
        start_url: startUrl,
        zoom_meeting_id: zoomMeetingId,
      })
      .select()
      .single();

    if (insertError || !session) {
      res.status(500).json({ error: insertError?.message ?? "Failed to create video session" });
      return;
    }

    // Get all enrolled students in the course
    const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", courseId);

    if (enrollmentsError) {
      console.error("Failed to fetch enrollments for notifications:", enrollmentsError.message);
    }

    const students = enrollments ?? [];

    if (students.length > 0) {
      const notifications = students.map((e: { student_id: string }) => ({
        user_id: e.student_id,
        title: `Live class started in ${course.title}`,
        message: `Your teacher has started a live class via ${provider === "zoom" ? "Zoom" : "Jitsi"}. Click to join.`,
        type: "video_session",
        metadata: { session_id: session.id, join_url: joinUrl, provider },
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
      provider,
      joinUrl,
      startUrl,
      zoomEnabled: ZOOM_ENABLED,
      // Legacy field kept for backward compat
      jitsiUrl: provider === "jitsi" ? joinUrl : null,
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

    const provider = (session.provider as string) ?? "jitsi";
    const joinUrl = (session.join_url as string) ?? `https://meet.jit.si/${session.room_id as string}`;

    res.json({
      sessionId: session.id,
      courseId: session.course_id,
      roomId: session.room_id,
      startedBy: session.started_by,
      isActive: session.is_active,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      provider,
      joinUrl,
      zoomEnabled: ZOOM_ENABLED,
      // Legacy
      jitsiUrl: provider === "jitsi" ? joinUrl : null,
    });
  }
);

// GET /video/providers — returns which meeting providers are available
// Frontend uses this to show/hide the Zoom option in the UI
router.get("/video/providers", requireAuth, (_req, res) => {
  res.json({
    jitsi: { enabled: true, label: "Jitsi Meet", description: "Free, open-source video conferencing" },
    zoom: {
      enabled: ZOOM_ENABLED,
      label: "Zoom",
      description: ZOOM_ENABLED
        ? "Zoom meetings (configured)"
        : "Zoom meetings (not configured — add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET to enable)",
    },
  });
});

export default router;
