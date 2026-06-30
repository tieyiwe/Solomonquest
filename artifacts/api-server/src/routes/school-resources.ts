import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// GET /school-resources
router.get(
  "/school-resources",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { category } = req.query;

    let query = supabaseAdmin
      .from("school_resources")
      .select("*")
      .eq("school_id", req.schoolId ?? "")
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category as string);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data ?? []);
  }
);

// POST /school-resources
router.post(
  "/school-resources",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (role !== "admin" && role !== "staff") {
      res.status(403).json({ error: "Forbidden: admin or staff only" });
      return;
    }

    const {
      title,
      description,
      resourceType,
      fileUrl,
      externalUrl,
      category,
      visibleTo,
    } = req.body;

    if (!title || !resourceType) {
      res.status(400).json({ error: "title and resourceType are required" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("school_resources")
      .insert({
        school_id: req.schoolId,
        title,
        description: description ?? null,
        resource_type: resourceType,
        file_url: fileUrl ?? null,
        external_url: externalUrl ?? null,
        category: category ?? null,
        visible_to: visibleTo ?? null,
        created_by: req.userId,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  }
);

// PATCH /school-resources/:id
router.patch(
  "/school-resources/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (role !== "admin" && role !== "staff") {
      res.status(403).json({ error: "Forbidden: admin or staff only" });
      return;
    }

    const { id } = req.params;

    const {
      title,
      description,
      resourceType,
      fileUrl,
      externalUrl,
      category,
      visibleTo,
    } = req.body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (resourceType !== undefined) updates.resource_type = resourceType;
    if (fileUrl !== undefined) updates.file_url = fileUrl;
    if (externalUrl !== undefined) updates.external_url = externalUrl;
    if (category !== undefined) updates.category = category;
    if (visibleTo !== undefined) updates.visible_to = visibleTo;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("school_resources")
      .update(updates)
      .eq("id", id)
      .eq("school_id", req.schoolId ?? "")
      .select()
      .single();

    if (error) {
      res.status(404).json({ error: "Resource not found or update failed" });
      return;
    }

    res.json(data);
  }
);

// DELETE /school-resources/:id
router.delete(
  "/school-resources/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (role !== "admin" && role !== "staff") {
      res.status(403).json({ error: "Forbidden: admin or staff only" });
      return;
    }

    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("school_resources")
      .delete()
      .eq("id", id)
      .eq("school_id", req.schoolId ?? "");

    if (error) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    res.sendStatus(204);
  }
);

export default router;
