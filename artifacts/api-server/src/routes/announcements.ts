import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/announcements", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  let query = supabaseAdmin
    .from("announcements")
    .select("*")
    .eq("school_id", req.schoolId ?? "")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (req.query.courseId) {
    query = query.eq("course_id", req.query.courseId as string);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const announcements = await Promise.all((data ?? []).map(enrichAnnouncement));
  res.json(announcements);
});

router.post("/announcements", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { title, content, courseId, isPinned } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
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

  res.status(201).json(await enrichAnnouncement(data));
});

router.delete("/announcements/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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

export default router;
