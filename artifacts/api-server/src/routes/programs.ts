import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/programs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from("programs")
    .select("*")
    .eq("school_id", req.schoolId ?? "")
    .order("name");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json((data ?? []).map(mapProgram));
});

router.post("/programs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { name, code, description, level } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("programs")
    .insert({
      school_id: req.schoolId,
      name,
      code: code ?? null,
      description: description ?? null,
      level: level ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(mapProgram(data));
});

router.get("/programs/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  let query = supabaseAdmin.from("programs").select("*").eq("id", id);
  if (req.userRole !== "super_admin") {
    query = query.eq("school_id", req.schoolId ?? "");
  }

  const { data, error } = await query.single();

  if (error || !data) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.json(mapProgram(data));
});

router.patch("/programs/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, code, description, level, isActive } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (code !== undefined) updates.code = code;
  if (description !== undefined) updates.description = description;
  if (level !== undefined) updates.level = level;
  if (isActive !== undefined) updates.is_active = isActive;

  let query = supabaseAdmin.from("programs").update(updates).eq("id", id);
  if (req.userRole !== "super_admin") {
    query = query.eq("school_id", req.schoolId ?? "");
  }

  const { data, error } = await query.select().single();

  if (error || !data) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.json(mapProgram(data));
});

router.delete("/programs/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  let query = supabaseAdmin.from("programs").delete().eq("id", id);
  if (req.userRole !== "super_admin") {
    query = query.eq("school_id", req.schoolId ?? "");
  }

  const { error } = await query;

  if (error) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.sendStatus(204);
});

function mapProgram(p: Record<string, unknown>) {
  return {
    id: p.id,
    schoolId: p.school_id,
    name: p.name,
    code: p.code,
    description: p.description,
    level: p.level,
    isActive: p.is_active,
  };
}

export default router;
