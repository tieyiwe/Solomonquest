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

// GET /users/me/notification-prefs - get current user's notification preferences
router.get("/users/me/notification-prefs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("notification_prefs")
    .eq("id", req.userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json({ notification_prefs: data.notification_prefs ?? {} });
});

// PUT /users/me/notification-prefs - update current user's notification preferences
router.put("/users/me/notification-prefs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { in_app, email, chat, forum, assignments, grades, resources, applications } = req.body;

  const notification_prefs: Record<string, unknown> = {};
  if (in_app !== undefined) notification_prefs.in_app = in_app;
  if (email !== undefined) notification_prefs.email = email;
  if (chat !== undefined) notification_prefs.chat = chat;
  if (forum !== undefined) notification_prefs.forum = forum;
  if (assignments !== undefined) notification_prefs.assignments = assignments;
  if (grades !== undefined) notification_prefs.grades = grades;
  if (resources !== undefined) notification_prefs.resources = resources;
  if (applications !== undefined) notification_prefs.applications = applications;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ notification_prefs })
    .eq("id", req.userId)
    .select("notification_prefs")
    .single();

  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to update notification preferences" });
    return;
  }

  res.json({ notification_prefs: data.notification_prefs });
});

// PUT /users/me/online - update last online time
router.put("/users/me/online", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ online_at: new Date().toISOString() })
    .eq("id", req.userId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

// GET /users/search - search users by unique_student_id or first/last name
router.get("/users/search", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const query = req.query.query as string | undefined;
  const school_id = req.query.school_id as string | undefined;

  if (!query) {
    res.status(400).json({ error: "query parameter is required" });
    return;
  }

  let dbQuery = supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, unique_student_id, avatar_url, role");

  if (school_id) {
    dbQuery = dbQuery.eq("school_id", school_id);
  }

  dbQuery = dbQuery.or(
    `unique_student_id.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`
  );

  const { data, error } = await dbQuery;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

// POST /users/admin/reset-password - admin resets any user's password
router.post("/users/admin/reset-password", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { user_id, new_password } = req.body;

  if (!user_id || !new_password) {
    res.status(400).json({ error: "user_id and new_password are required" });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to reset password" });
    return;
  }

  res.json({ success: true });
});

export default router;
