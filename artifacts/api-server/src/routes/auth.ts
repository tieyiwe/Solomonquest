import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", req.userId)
    .single();

  if (error || !profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  // Get email from auth.users via admin API
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(req.userId!);

  res.json({
    id: profile.id,
    schoolId: profile.school_id,
    role: profile.role,
    firstName: profile.first_name,
    lastName: profile.last_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    email: userData?.user?.email ?? null,
  });
});

export default router;
