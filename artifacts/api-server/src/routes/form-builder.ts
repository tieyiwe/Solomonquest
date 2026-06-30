import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ─── GET /schools/:schoolId/application-form ─────────────────────────────────
// Public: get form fields for a school ordered by sort_order
router.get(
  "/schools/:schoolId/application-form",
  async (req, res): Promise<void> => {
    const schoolId = req.params.schoolId;

    const { data, error } = await supabaseAdmin
      .from("application_form_fields")
      .select("*")
      .eq("school_id", schoolId)
      .order("sort_order", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(
      (data ?? []).map((f: Record<string, unknown>) => ({
        id: f.id,
        schoolId: f.school_id,
        label: f.label,
        fieldType: f.field_type,
        isRequired: f.is_required,
        options: f.options,
        sortOrder: f.sort_order,
        createdAt: f.created_at,
      }))
    );
  }
);

// ─── POST /schools/:schoolId/application-form/fields ─────────────────────────
// Admin: add a new field to the school's application form
router.post(
  "/schools/:schoolId/application-form/fields",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const schoolId = req.params.schoolId;

    if (req.userRole !== "admin" && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { label, fieldType, isRequired, options, sortOrder } = req.body;

    if (!label || !fieldType) {
      res.status(400).json({ error: "label and fieldType are required" });
      return;
    }

    // Default sort_order to end of list if not provided
    let resolvedSortOrder = sortOrder;
    if (resolvedSortOrder === undefined || resolvedSortOrder === null) {
      const { count } = await supabaseAdmin
        .from("application_form_fields")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId);
      resolvedSortOrder = (count ?? 0) + 1;
    }

    const { data, error } = await supabaseAdmin
      .from("application_form_fields")
      .insert({
        school_id: schoolId,
        label,
        field_type: fieldType,
        is_required: isRequired ?? false,
        options: options ?? null,
        sort_order: resolvedSortOrder,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json({
      id: data.id,
      schoolId: data.school_id,
      label: data.label,
      fieldType: data.field_type,
      isRequired: data.is_required,
      options: data.options,
      sortOrder: data.sort_order,
      createdAt: data.created_at,
    });
  }
);

// ─── PATCH /schools/:schoolId/application-form/fields/:fieldId ───────────────
// Admin: update any field properties
router.patch(
  "/schools/:schoolId/application-form/fields/:fieldId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { schoolId, fieldId } = req.params;

    if (req.userRole !== "admin" && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { label, fieldType, isRequired, options, sortOrder } = req.body;

    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label;
    if (fieldType !== undefined) updates.field_type = fieldType;
    if (isRequired !== undefined) updates.is_required = isRequired;
    if (options !== undefined) updates.options = options;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("application_form_fields")
      .update(updates)
      .eq("id", fieldId)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Field not found" });
      return;
    }

    res.json({
      id: data.id,
      schoolId: data.school_id,
      label: data.label,
      fieldType: data.field_type,
      isRequired: data.is_required,
      options: data.options,
      sortOrder: data.sort_order,
      createdAt: data.created_at,
    });
  }
);

// ─── DELETE /schools/:schoolId/application-form/fields/:fieldId ──────────────
// Admin: delete a field
router.delete(
  "/schools/:schoolId/application-form/fields/:fieldId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { schoolId, fieldId } = req.params;

    if (req.userRole !== "admin" && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("application_form_fields")
      .delete()
      .eq("id", fieldId)
      .eq("school_id", schoolId);

    if (error) {
      res.status(404).json({ error: "Field not found or could not be deleted" });
      return;
    }

    res.status(204).send();
  }
);

// ─── PATCH /schools/:schoolId/application-form/reorder ───────────────────────
// Admin: reorder fields — body: { fieldIds: string[] }
router.patch(
  "/schools/:schoolId/application-form/reorder",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const schoolId = req.params.schoolId;

    if (req.userRole !== "admin" && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { fieldIds } = req.body as { fieldIds?: string[] };

    if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
      res.status(400).json({ error: "fieldIds must be a non-empty array" });
      return;
    }

    // Update sort_order for each field based on array position (1-indexed)
    const updates = fieldIds.map((id, index) =>
      supabaseAdmin
        .from("application_form_fields")
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("school_id", schoolId)
    );

    const results = await Promise.all(updates);

    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      res.status(500).json({ error: firstError.error.message });
      return;
    }

    res.json({ success: true, reordered: fieldIds.length });
  }
);

export default router;
