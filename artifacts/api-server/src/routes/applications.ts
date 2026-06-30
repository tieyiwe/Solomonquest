import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/applications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  let query = supabaseAdmin
    .from("student_applications")
    .select("*")
    .eq("school_id", req.schoolId ?? "")
    .order("created_at" as string, { ascending: false });

  if (req.query.status) {
    query = query.eq("status", req.query.status as string);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const applications = await Promise.all((data ?? []).map(enrichApplication));
  res.json(applications);
});

router.post("/applications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { schoolId, programId } = req.body;

  if (!schoolId) {
    res.status(400).json({ error: "schoolId is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("student_applications")
    .insert({
      school_id: schoolId,
      program_id: programId ?? null,
      applicant_id: req.userId,
      status: "submitted",
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(await enrichApplication(data));
});

router.patch("/applications/:id/status", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status } = req.body;

  const validStatuses = ["submitted", "under_review", "accepted", "enrolled", "rejected"];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("student_applications")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json(await enrichApplication(data));
});

async function enrichApplication(a: Record<string, unknown>) {
  let applicantName: string | null = null;
  let programName: string | null = null;

  if (a.applicant_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", a.applicant_id as string)
      .single();
    if (profile) {
      applicantName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
    }
  }

  if (a.program_id) {
    const { data: program } = await supabaseAdmin
      .from("programs")
      .select("name")
      .eq("id", a.program_id as string)
      .single();
    if (program) programName = program.name;
  }

  return {
    id: a.id,
    schoolId: a.school_id,
    programId: a.program_id,
    applicantId: a.applicant_id,
    status: a.status,
    applicantName,
    programName,
  };
}

export default router;
