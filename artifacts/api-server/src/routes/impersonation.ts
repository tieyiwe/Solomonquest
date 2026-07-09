import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admins can preview the app as a teacher/student/staff account to check
// what they'd see after a change — never as another admin or super_admin.
const IMPERSONATABLE_ROLES = new Set(["teacher", "staff", "student"]);

// ─── POST /admin/impersonate/:userId ─────────────────────────────────────────
// Mints a one-time login link for the target user via the Supabase admin API
// and hands back just the pieces the client needs to redeem it with
// supabase.auth.verifyOtp — this establishes a *real* session as that user,
// so every existing fetch/query in the app "just works" once the client
// swaps to it, with no per-page changes needed.

router.post(
  "/admin/impersonate/:userId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (req.userRole !== "admin" && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

    const { data: target, error } = await supabaseAdmin
      .from("profiles")
      .select("id, role, school_id, first_name, last_name")
      .eq("id", userId)
      .single();

    if (error || !target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!IMPERSONATABLE_ROLES.has(target.role as string)) {
      res.status(403).json({ error: "You can only view as a teacher, staff member, or student" });
      return;
    }

    if (target.school_id !== req.schoolId && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authError || !authUser?.user?.email) {
      res.status(404).json({ error: "This user has no login email on file" });
      return;
    }

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });

    if (linkError || !link) {
      res.status(500).json({ error: linkError?.message ?? "Failed to start view-as session" });
      return;
    }

    const hashedToken = (link.properties as { hashed_token?: string } | undefined)?.hashed_token;
    if (!hashedToken) {
      res.status(500).json({ error: "Failed to start view-as session" });
      return;
    }

    await supabaseAdmin.from("platform_audit_log").insert({
      action: "admin_impersonate_start",
      performed_by: req.userId,
      target_type: "user",
      target_id: userId,
      target_name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || authUser.user.email,
      metadata: { targetRole: target.role },
    });

    logger.info(
      { adminId: req.userId, targetUserId: userId, targetRole: target.role },
      "Admin started view-as session"
    );

    res.json({
      emailOtp: hashedToken,
      email: authUser.user.email,
      targetUser: {
        id: target.id,
        name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || authUser.user.email,
        role: target.role,
      },
    });
  }
);

export default router;
