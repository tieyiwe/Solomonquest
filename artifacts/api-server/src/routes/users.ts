import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// List users in school
router.get("/users", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.schoolId) {
    res.status(403).json({ error: "Not associated with a school" });
    return;
  }

  let query = supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("school_id", req.schoolId);

  const role = req.query.role as string | undefined;
  if (role) {
    query = query.eq("role", role);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Fetch emails from auth
  const profiles = await Promise.all(
    (data ?? []).map(async (p) => {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(p.id);
      return mapProfile(p, userData?.user?.email);
    })
  );

  res.json(profiles);
});

// Get single user
router.get("/users/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
  res.json(mapProfile(data, userData?.user?.email));
});

// Update user profile
router.patch("/users/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { firstName, lastName, avatarUrl, bio } = req.body;

  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) updates.first_name = firstName;
  if (lastName !== undefined) updates.last_name = lastName;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
  if (bio !== undefined) updates.bio = bio;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
  res.json(mapProfile(data, userData?.user?.email));
});

// Update user role
router.patch("/users/:id/role", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { role } = req.body;

  if (!role) {
    res.status(400).json({ error: "role is required" });
    return;
  }

  const validRoles = ["super_admin", "admin", "teacher", "staff", "student"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
  res.json(mapProfile(data, userData?.user?.email));
});

function mapProfile(p: Record<string, unknown>, email?: string | null) {
  return {
    id: p.id,
    schoolId: p.school_id,
    role: p.role,
    firstName: p.first_name,
    lastName: p.last_name,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    email: email ?? null,
  };
}

export default router;
