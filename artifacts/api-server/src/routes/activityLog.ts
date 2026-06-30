import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// POST /activity-log — log a user action
router.post("/activity-log", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { action, target_type, target_id, target_name, metadata } = req.body;

  if (!action) {
    res.status(400).json({ error: "action is required" });
    return;
  }

  const { error } = await supabaseAdmin.from("platform_audit_log").insert({
    action,
    target_type: target_type ?? null,
    target_id: target_id ?? null,
    target_name: target_name ?? null,
    performed_by: req.userId,
    metadata: metadata ?? null,
  });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.sendStatus(201);
});

// GET /activity-log — fetch activity log for school admins
router.get("/activity-log", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string || "100"), 500);
  const offset = parseInt(req.query.offset as string || "0");

  // Fetch log entries for users in this school
  const { data: schoolUsers } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("school_id", req.schoolId ?? "");

  const userIds = (schoolUsers ?? []).map((u: { id: string }) => u.id);
  if (userIds.length === 0) {
    res.json({ entries: [], total: 0 });
    return;
  }

  const { data, error, count } = await supabaseAdmin
    .from("platform_audit_log")
    .select("*, profiles:performed_by(first_name, last_name, email, role)", { count: "exact" })
    .in("performed_by", userIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    entries: (data ?? []).map((e: Record<string, unknown>) => {
      const profile = e.profiles as Record<string, unknown> | null;
      return {
        id: e.id,
        action: e.action,
        targetType: e.target_type,
        targetId: e.target_id,
        targetName: e.target_name,
        metadata: e.metadata,
        performedBy: e.performed_by,
        performerName: profile
          ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || (profile.email as string)
          : "Unknown",
        performerRole: profile?.role ?? "",
        createdAt: e.created_at,
      };
    }),
    total: count ?? 0,
  });
});

export default router;
