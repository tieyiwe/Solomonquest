import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, type, message, metadata, is_read, created_at")
    .eq("user_id", req.userId ?? "")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

router.get("/notifications/unread-count", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId ?? "";

  const [notifResult, msgResult] = await Promise.all([
    supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false),
    supabaseAdmin
      .from("internal_messages")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", userId)
      .eq("is_read", false),
  ]);

  if (notifResult.error) {
    res.status(500).json({ error: notifResult.error.message });
    return;
  }
  if (msgResult.error) {
    res.status(500).json({ error: msgResult.error.message });
    return;
  }

  const notifications = notifResult.count ?? 0;
  const messages = msgResult.count ?? 0;

  res.json({ notifications, messages, total: notifications + messages });
});

router.put("/notifications/:id/read", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", req.userId ?? "");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

router.put("/notifications/read-all", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", req.userId ?? "")
    .eq("is_read", false);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

// Keep legacy PATCH endpoint for backward compatibility
router.patch("/notifications/:id/read", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", req.userId ?? "");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

// Keep legacy POST endpoint for backward compatibility
router.post("/notifications/read-all", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", req.userId ?? "")
    .eq("is_read", false);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

export default router;
