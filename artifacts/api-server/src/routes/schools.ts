import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
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

// Update school
router.patch("/schools/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, primaryColor, secondaryColor, logoUrl, isActive } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (primaryColor !== undefined) updates.primary_color = primaryColor;
  if (secondaryColor !== undefined) updates.secondary_color = secondaryColor;
  if (logoUrl !== undefined) updates.logo_url = logoUrl;
  if (isActive !== undefined) updates.is_active = isActive;

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

function mapSchool(s: Record<string, unknown>) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    ownerId: s.owner_id,
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    logoUrl: s.logo_url,
    isActive: s.is_active,
    createdAt: s.created_at,
  };
}

export default router;
