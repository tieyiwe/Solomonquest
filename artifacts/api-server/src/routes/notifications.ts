import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("user_id", req.userId ?? "")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json((data ?? []).map((n: Record<string, unknown>) => ({
    id: n.id,
    userId: n.user_id,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: n.is_read,
    createdAt: n.created_at,
  })));
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json({
    id: data.id,
    userId: data.user_id,
    title: data.title,
    body: data.body,
    link: data.link,
    isRead: data.is_read,
    createdAt: data.created_at,
  });
});

router.post("/notifications/read-all", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", req.userId ?? "")
    .eq("is_read", false);

  res.json({ success: true });
});

export default router;
