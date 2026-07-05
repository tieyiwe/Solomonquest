import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { sendPasswordResetEmail } from "../lib/email";

const router: IRouter = Router();

// List users in school — admin/teacher only
router.get("/users", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.schoolId) {
    res.status(403).json({ error: "Not associated with a school" });
    return;
  }

  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
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
    res.status(500).json({ error: "Failed to fetch users" });
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
    res.status(500).json({ error: "Failed to update notification preferences" });
    return;
  }

  res.json({ notification_prefs: data.notification_prefs });
});

// PUT /users/me/join-school — link a newly registered student to a school
router.put("/users/me/join-school", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { schoolId } = req.body as { schoolId?: string };
  if (!schoolId) {
    res.status(400).json({ error: "schoolId is required" });
    return;
  }

  // Verify the school exists
  const { data: school, error: schoolErr } = await supabaseAdmin
    .from("schools")
    .select("id, name")
    .eq("id", schoolId)
    .single();

  if (schoolErr || !school) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  // Only allow if user has no school yet (prevent school-hopping)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("school_id, role")
    .eq("id", req.userId!)
    .single();

  if (profile?.school_id) {
    res.status(409).json({ error: "You are already associated with a school" });
    return;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({ school_id: schoolId, role: "student" })
    .eq("id", req.userId!);

  if (updateErr) {
    res.status(500).json({ error: "Failed to join school" });
    return;
  }

  // Auto-enroll in school's public chat channels
  try {
    const { enrollUserInSchoolChannels } = await import("./chat");
    await enrollUserInSchoolChannels(req.userId!, schoolId);
  } catch { /* non-fatal */ }

  res.json({ success: true, schoolId, schoolName: school.name });
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
    res.status(500).json({ error: "Failed to update online status" });
    return;
  }

  res.json({ success: true });
});

// GET /users/search - search users by name, email, or student ID
// Scoped to requester's school; all authenticated users can search within their school
router.get("/users/search", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const queryParam = (req.query.query as string | undefined)?.trim();

  // Always scope search to caller's school
  let dbQuery = supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, unique_student_id, internal_email, avatar_url, role");

  if (req.userRole === "super_admin") {
    const school_id = req.query.school_id as string | undefined;
    if (school_id) {
      dbQuery = dbQuery.eq("school_id", school_id);
    }
  } else {
    if (!req.schoolId) {
      res.status(403).json({ error: "Not associated with a school" });
      return;
    }
    dbQuery = dbQuery.eq("school_id", req.schoolId);
  }

  if (req.userId) {
    dbQuery = dbQuery.neq("id", req.userId);
  }

  // No query yet: return everyone in the school, alphabetical by first name,
  // so the UI can show a browsable directory before the user types anything.
  if (queryParam) {
    const q = queryParam.replace(/'/g, "");
    dbQuery = dbQuery.or(
      `unique_student_id.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,internal_email.ilike.%${q}%`
    );
  }

  const { data, error } = await dbQuery
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true })
    .limit(queryParam ? 20 : 50);

  if (error) {
    res.status(500).json({ error: "Search failed" });
    return;
  }

  res.json(data ?? []);
});

// POST /users/me/avatar - update current user's avatar
router.post("/users/me/avatar", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { avatar_url, avatar_type, avatar_index } = req.body;

  let resolvedAvatarUrl: string | undefined;

  if (avatar_type === "default") {
    if (typeof avatar_index !== "number" || avatar_index < 0 || avatar_index > 7) {
      res.status(400).json({ error: "avatar_index must be a number between 0 and 7" });
      return;
    }
    resolvedAvatarUrl = `default:${avatar_index}`;
  } else if (avatar_url !== undefined) {
    if (typeof avatar_url !== "string" || avatar_url.trim() === "") {
      res.status(400).json({ error: "avatar_url must be a non-empty string" });
      return;
    }
    resolvedAvatarUrl = avatar_url.trim();
  } else {
    res.status(400).json({ error: "Provide either avatar_url or { avatar_type: 'default', avatar_index: number }" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ avatar_url: resolvedAvatarUrl })
    .eq("id", req.userId)
    .select()
    .single();

  if (error || !data) {
    res.status(500).json({ error: "Failed to update avatar" });
    return;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(req.userId);
  res.json(mapProfile(data, userData?.user?.email));
});

// Get single user — must be same school (or self), unless super_admin
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

  // super_admin can view any user; others must share school or be viewing themselves
  if (req.userRole !== "super_admin") {
    if (data.school_id !== req.schoolId && req.userId !== id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
  res.json(mapProfile(data, userData?.user?.email));
});

// Update user profile — self or admin of same school; role changes are never allowed here
router.patch("/users/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Ownership check: must be the user themselves OR an admin/super_admin
  const isSelf = req.userId === id;
  const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Admins (non-super_admin) may only update users in the same school
  if (isAdmin && req.userRole !== "super_admin") {
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", id)
      .single();

    if (!targetProfile || targetProfile.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Only allow safe profile fields — never role
  const { firstName, lastName, avatarUrl, bio } = req.body;

  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) updates.first_name = firstName;
  if (lastName !== undefined) updates.last_name = lastName;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
  if (bio !== undefined) updates.bio = bio;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

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

// Update user role — admin/super_admin only, same-school constraint for admin
router.patch("/users/:id/role", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

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

  // Admins (non-super_admin) may only change roles for users in the same
  // school, and can never grant super_admin — that would be a privilege
  // escalation to platform-wide access from a single-school role.
  if (req.userRole !== "super_admin") {
    if (role === "super_admin") {
      res.status(403).json({ error: "Only a super admin can grant super admin access" });
      return;
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("school_id, role")
      .eq("id", id)
      .single();

    if (!targetProfile || targetProfile.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Also block demoting/modifying an existing super_admin from a
    // regular admin account, for the same reason.
    if (targetProfile.role === "super_admin") {
      res.status(403).json({ error: "Only a super admin can change another super admin's role" });
      return;
    }

    if (id === req.userId) {
      res.status(403).json({ error: "You cannot change your own role" });
      return;
    }
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
    internalEmail: p.internal_email ?? null,
    uniqueStudentId: p.unique_student_id ?? null,
  };
}

// POST /users/:id/reset-password - admin sends password reset email to user
router.post("/users/:id/reset-password", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Verify target user belongs to the same school (unless super_admin)
  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("school_id, first_name, last_name")
    .eq("id", id)
    .single();

  if (!targetProfile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.userRole !== "super_admin" && targetProfile.school_id !== req.schoolId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
  const userEmail = userData?.user?.email;

  if (!userEmail) {
    res.status(400).json({ error: "User has no email address" });
    return;
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: userEmail,
  });

  if (linkError || !linkData) {
    res.status(500).json({ error: "Failed to generate reset link" });
    return;
  }

  const resetLink = linkData.properties?.action_link;

  if (!resetLink) {
    res.status(500).json({ error: "Failed to generate reset link" });
    return;
  }

  await sendPasswordResetEmail({
    to: userEmail,
    resetUrl: resetLink,
  });

  res.json({ success: true, message: "Password reset email sent" });
});

// POST /users/admin/reset-password - admin resets a user's password; same-school constraint
router.post("/users/admin/reset-password", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { user_id, new_password } = req.body;

  if (!user_id || !new_password) {
    res.status(400).json({ error: "user_id and new_password are required" });
    return;
  }

  // Verify target user belongs to the same school (unless super_admin)
  if (req.userRole !== "super_admin") {
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", user_id)
      .single();

    if (!targetProfile || targetProfile.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error || !data) {
    res.status(500).json({ error: "Failed to reset password" });
    return;
  }

  res.json({ success: true });
});

export default router;
