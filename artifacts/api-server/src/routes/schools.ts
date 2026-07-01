import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { logger } from "../lib/logger";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// List all schools (public)
router.get("/schools", async (_req, res): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from("schools")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ error }, "Supabase error listing schools");
      res.status(500).json({ error: error.message });
      return;
    }

    res.json((data ?? []).map(mapSchool));
  } catch (err: any) {
    logger.error({ err }, "Unhandled error listing schools");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user's school
router.get("/schools/my", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.schoolId) {
    res.status(404).json({ error: "No school associated" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("id", req.schoolId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// Get school by slug (public)
router.get("/schools/:slug", optionalAuth, async (req, res): Promise<void> => {
  const { slug } = req.params;

  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// Create school
router.post("/schools/create", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { name, slug, primaryColor, secondaryColor } = req.body;

  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: "Slug must contain only lowercase letters, numbers, and hyphens." });
    return;
  }

  // Enforce unique school name (case-insensitive)
  const { data: nameConflict } = await supabaseAdmin
    .from("schools")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (nameConflict) {
    res.status(409).json({ error: "A school with this name already exists. Please choose a different name." });
    return;
  }

  // Enforce unique slug
  const { data: slugConflict } = await supabaseAdmin
    .from("schools")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (slugConflict) {
    res.status(409).json({ error: "This URL slug is already taken. Please choose a different one." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("schools")
    .insert({
      name,
      slug,
      owner_id: req.userId,
      primary_color: primaryColor ?? "#6E5238",
      secondary_color: secondaryColor ?? "#B58F5E",
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    // DB-level unique constraint fallback
    if (error.code === "23505") {
      const msg = error.message.includes("name")
        ? "A school with this name already exists."
        : "This URL slug is already taken.";
      res.status(409).json({ error: msg });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }

  // Assign admin role to creator
  await supabaseAdmin
    .from("profiles")
    .update({ school_id: data.id, role: "admin" })
    .eq("id", req.userId);

  res.status(201).json(mapSchool(data));
});

// Get school by slug (public, explicit path to avoid conflict with /:id)
router.get("/schools/slug/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;

  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// Update school branding (admin only)
router.put("/schools/:id/branding", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "super_admin") {
    if (req.userRole !== "admin" || req.schoolId !== id) {
      res.status(403).json({ error: "Not authorized to update this school's branding" });
      return;
    }
  }

  const body = req.body as Record<string, unknown>;
  const { slug, logo_url, tagline, primary_color, secondary_color } = body;

  // Validate slug if provided
  if (slug !== undefined) {
    if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: "Slug must be lowercase alphanumeric with hyphens only" });
      return;
    }
    const { data: slugConflict } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle();
    if (slugConflict) {
      res.status(409).json({ error: "Slug is already taken" });
      return;
    }
  }

  // Only update columns guaranteed to exist in the base schema
  const coreUpdates: Record<string, unknown> = {};
  if (slug !== undefined) coreUpdates.slug = slug;
  if (logo_url !== undefined) coreUpdates.logo_url = logo_url;
  if (tagline !== undefined) coreUpdates.tagline = tagline;
  if (primary_color !== undefined) coreUpdates.primary_color = primary_color;
  if (secondary_color !== undefined) coreUpdates.secondary_color = secondary_color;

  // Fetch existing branding JSONB and merge full body into it
  const { data: currentRow } = await supabaseAdmin
    .from("schools").select("branding").eq("id", id).single();
  const existingBranding = (currentRow?.branding as Record<string, unknown>) ?? {};
  const mergedBranding = { ...existingBranding, ...body };

  // Try saving with branding JSONB; fall back to core columns only if branding column missing
  let { data, error } = await supabaseAdmin
    .from("schools")
    .update({ ...coreUpdates, branding: mergedBranding })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logger.warn({ error }, "branding update failed, retrying with core columns only");
    const fallback = await supabaseAdmin
      .from("schools")
      .update(coreUpdates)
      .eq("id", id)
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    logger.error({ error }, "Error updating school branding");
    res.status(500).json({ error: error?.message ?? "Update failed" });
    return;
  }

  res.json(mapSchool(data));
  } catch (err: any) {
    logger.error({ err }, "Unhandled error in PUT /schools/:id/branding");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// Update school
router.patch("/schools/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Only admin/super_admin of this school may update it
  if (req.userRole !== "super_admin") {
    if (req.userRole !== "admin" || req.schoolId !== id) {
      res.status(403).json({ error: "Not authorized to update this school" });
      return;
    }
  }
  const { name, primaryColor, secondaryColor, logoUrl, isActive, applicationsOpen, assignment_routing } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (primaryColor !== undefined) updates.primary_color = primaryColor;
  if (secondaryColor !== undefined) updates.secondary_color = secondaryColor;
  if (logoUrl !== undefined) updates.logo_url = logoUrl;
  if (isActive !== undefined) updates.is_active = isActive;
  if (applicationsOpen !== undefined) updates.applications_open = applicationsOpen;
  if (assignment_routing !== undefined) updates.assignment_routing = assignment_routing;

  const { data, error } = await supabaseAdmin
    .from("schools")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// POST /schools/:id/request-deletion — school admin initiates deletion request
router.post("/schools/:id/request-deletion", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Verify caller is admin of this school
  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("role, school_id")
    .eq("id", req.userId)
    .single();

  if (!callerProfile || callerProfile.role !== "admin" || callerProfile.school_id !== id) {
    res.status(403).json({ error: "You must be an admin of this school to request deletion." });
    return;
  }

  // Fetch school record
  const { data: school, error: schoolErr } = await supabaseAdmin
    .from("schools")
    .select("id, name")
    .eq("id", id)
    .single();

  if (schoolErr || !school) {
    res.status(404).json({ error: "School not found." });
    return;
  }

  // Prerequisite 1: active students
  const { count: studentCount } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("school_id", id)
    .eq("role", "student");

  if ((studentCount ?? 0) > 0) {
    res.status(400).json({
      error: `Cannot request deletion: school has ${studentCount} active students. Please unenroll all students first.`,
    });
    return;
  }

  // Prerequisite 2: teachers
  const { count: teacherCount } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("school_id", id)
    .eq("role", "teacher");

  if ((teacherCount ?? 0) > 0) {
    res.status(400).json({
      error: `Cannot request deletion: school has ${teacherCount} teachers. Please remove all teachers first.`,
    });
    return;
  }

  // Prerequisite 3: active courses
  const { count: courseCount } = await supabaseAdmin
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("school_id", id);

  if ((courseCount ?? 0) > 0) {
    res.status(400).json({
      error: `Cannot request deletion: school has ${courseCount} active courses. Please delete all courses first.`,
    });
    return;
  }

  const { reason } = req.body;

  // Insert deletion request
  const { data: deletionRequest, error: insertErr } = await supabaseAdmin
    .from("school_deletion_requests")
    .insert({
      school_id: id,
      school_name: school.name,
      requested_by: req.userId,
      reason: reason ?? null,
      status: "pending",
    })
    .select("id, status, created_at")
    .single();

  if (insertErr || !deletionRequest) {
    logger.error({ error: insertErr }, "Failed to insert school_deletion_requests");
    res.status(500).json({ error: "Failed to create deletion request." });
    return;
  }

  // Audit log
  await supabaseAdmin.from("platform_audit_log").insert({
    action: "deletion_requested",
    target_type: "school",
    target_id: id,
    target_name: school.name,
    performed_by: req.userId,
  });

  // Notify super_admins
  const { data: superAdmins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "super_admin");

  if (superAdmins && superAdmins.length > 0) {
    const notifications = superAdmins.map((sa: { id: string }) => ({
      user_id: sa.id,
      type: "school_deletion_requested",
      title: "School Deletion Request",
      message: `School "${school.name}" has submitted a deletion request.`,
      metadata: { school_id: id, request_id: deletionRequest.id },
      read: false,
    }));
    await supabaseAdmin.from("notifications").insert(notifications);
  }

  res.status(201).json({
    message: "Deletion request submitted. The platform team will review and contact you.",
    request_id: deletionRequest.id,
  });
});

// GET /schools/:id/deletion-status — check if a deletion request exists
router.get("/schools/:id/deletion-status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data: request } = await supabaseAdmin
    .from("school_deletion_requests")
    .select("id, status, created_at, reason")
    .eq("school_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({ request: request ?? null });
});

function mapSchool(s: Record<string, unknown>) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    ownerId: s.owner_id,
    // Individual branding columns (used by SchoolPublicPage directly)
    primary_color: s.primary_color,
    secondary_color: s.secondary_color,
    accent_color: s.accent_color,
    logo_url: s.logo_url,
    heading_font: s.heading_font,
    heading_color: s.heading_color,
    body_font: s.body_font,
    border_radius: s.border_radius,
    tagline: s.tagline,
    banner_url: s.banner_url,
    banner_slides: s.banner_slides ?? [],
    hero_animation: s.hero_animation,
    stats_visible: s.stats_visible ?? true,
    stats: s.stats ?? [],
    features_section: s.features_section ?? [],
    testimonials: s.testimonials ?? [],
    social_links: s.social_links ?? {},
    show_announcement: s.show_announcement ?? false,
    announcement_banner: s.announcement_banner,
    announcement_color: s.announcement_color,
    custom_css: s.custom_css,
    isActive: s.is_active,
    createdAt: s.created_at,
    applicationsOpen: s.applications_open ?? false,
    assignment_routing: s.assignment_routing ?? null,
    // Also expose camelCase aliases for backward compat
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    logoUrl: s.logo_url,
    headingFont: s.heading_font,
    headingColor: s.heading_color,
    customCss: s.custom_css,
    // branding JSONB if present
    branding: (s.branding as Record<string, unknown>) ?? {},
  };
}

export default router;
