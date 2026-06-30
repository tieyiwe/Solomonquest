import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { logger } from "../lib/logger";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// List all schools (public)
router.get("/schools", async (_req, res): Promise<void> => {
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
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const {
    logo_url,
    slug,
    primary_color,
    secondary_color,
    heading_font,
    heading_color,
    tagline,
    banner_url,
    custom_css,
  } = req.body;

  // Validate slug format if provided
  if (slug !== undefined) {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: "Slug must be lowercase alphanumeric with hyphens only" });
      return;
    }

    // Check slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: "Slug is already taken" });
      return;
    }
  }

  const {
    banner_slides,
    hero_animation,
    accent_color,
    body_font,
    border_radius,
    stats_visible,
    stats,
    features_section,
    testimonials,
    social_links,
    announcement_banner,
    announcement_color,
    show_announcement,
  } = req.body;

  const updates: Record<string, unknown> = {};
  if (logo_url !== undefined) updates.logo_url = logo_url;
  if (slug !== undefined) updates.slug = slug;
  if (primary_color !== undefined) updates.primary_color = primary_color;
  if (secondary_color !== undefined) updates.secondary_color = secondary_color;
  if (heading_font !== undefined) updates.heading_font = heading_font;
  if (heading_color !== undefined) updates.heading_color = heading_color;
  if (tagline !== undefined) updates.tagline = tagline;
  if (banner_url !== undefined) updates.banner_url = banner_url;
  if (custom_css !== undefined) updates.custom_css = custom_css;
  if (banner_slides !== undefined) updates.banner_slides = banner_slides;
  if (hero_animation !== undefined) updates.hero_animation = hero_animation;
  if (accent_color !== undefined) updates.accent_color = accent_color;
  if (body_font !== undefined) updates.body_font = body_font;
  if (border_radius !== undefined) updates.border_radius = border_radius;
  if (stats_visible !== undefined) updates.stats_visible = stats_visible;
  if (stats !== undefined) updates.stats = stats;
  if (features_section !== undefined) updates.features_section = features_section;
  if (testimonials !== undefined) updates.testimonials = testimonials;
  if (social_links !== undefined) updates.social_links = social_links;
  if (announcement_banner !== undefined) updates.announcement_banner = announcement_banner;
  if (announcement_color !== undefined) updates.announcement_color = announcement_color;
  if (show_announcement !== undefined) updates.show_announcement = show_announcement;

  const { data, error } = await supabaseAdmin
    .from("schools")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    logger.error({ error }, "Error updating school branding");
    res.status(404).json({ error: "School not found or update failed" });
    return;
  }

  res.json(mapSchool(data));
});

// Update school
router.patch("/schools/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, primaryColor, secondaryColor, logoUrl, isActive, applicationsOpen } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (primaryColor !== undefined) updates.primary_color = primaryColor;
  if (secondaryColor !== undefined) updates.secondary_color = secondaryColor;
  if (logoUrl !== undefined) updates.logo_url = logoUrl;
  if (isActive !== undefined) updates.is_active = isActive;
  if (applicationsOpen !== undefined) updates.applications_open = applicationsOpen;

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
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    logoUrl: s.logo_url,
    headingFont: s.heading_font,
    headingColor: s.heading_color,
    tagline: s.tagline,
    bannerUrl: s.banner_url,
    customCss: s.custom_css,
    isActive: s.is_active,
    createdAt: s.created_at,
    applicationsOpen: s.applications_open ?? false,
  };
}

export default router;
