import { Router, type IRouter, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { logger } from "../lib/logger";
import { invalidateCachedProfile } from "../lib/profileCache";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { notifyUsers } from "../lib/notifications";

const router: IRouter = Router();

const requireSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.userRole !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
};

function mapRequest(r: Record<string, unknown>) {
  return {
    id: r.id,
    requesterId: r.requester_id,
    requesterName: r.requester_name,
    requesterEmail: r.requester_email,
    requesterPhone: r.requester_phone,
    suggestedSchoolName: r.suggested_school_name,
    reason: r.reason,
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewNotes: r.review_notes,
    schoolId: r.school_id,
    createdAt: r.created_at,
  };
}

// POST /school-requests — a signed-in, school-less user asks to have a
// school created for them. Replaces instant self-serve creation: a super
// admin now has to approve first (and, once payment plans exist, the
// requester picks a plan at approval time instead of a school appearing
// immediately).
router.post("/school-requests", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { name, phone, suggestedSchoolName, reason } = req.body as {
      name?: string;
      phone?: string;
      suggestedSchoolName?: string;
      reason?: string;
    };

    if (!name?.trim() || !suggestedSchoolName?.trim()) {
      res.status(400).json({ error: "Your name and a suggested school name are required." });
      return;
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, school_id")
      .eq("id", req.userId)
      .single();

    if (requesterProfile?.school_id) {
      res.status(409).json({ error: "You already belong to a school." });
      return;
    }

    const { data: existingPending } = await supabaseAdmin
      .from("school_creation_requests")
      .select("id")
      .eq("requester_id", req.userId)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      res.status(409).json({ error: "You already have a pending school request." });
      return;
    }

    const { data: created, error } = await supabaseAdmin
      .from("school_creation_requests")
      .insert({
        requester_id: req.userId,
        requester_name: name.trim(),
        requester_email: requesterProfile?.email ?? null,
        requester_phone: phone?.trim() || null,
        suggested_school_name: suggestedSchoolName.trim(),
        reason: reason?.trim() || null,
        status: "pending",
      })
      .select()
      .single();

    if (error || !created) {
      res.status(500).json({ error: error?.message ?? "Failed to submit request" });
      return;
    }

    const { data: superAdmins } = await supabaseAdmin.from("profiles").select("id").eq("role", "super_admin");
    const superAdminIds = (superAdmins ?? []).map((p) => p.id as string);
    if (superAdminIds.length > 0) {
      notifyUsers({
        userIds: superAdminIds,
        type: "school_request_created",
        category: "platform",
        title: "New school request",
        body: `${name.trim()} (${requesterProfile?.email ?? "no email on file"}) requested a new school: "${suggestedSchoolName.trim()}".`,
        link: "/super_admin",
      }).catch((err) => logger.error({ err }, "Failed to notify super admins of new school request"));
    }

    res.status(201).json(mapRequest(created));
  } catch (err) {
    logger.error({ err }, "Failed to create school request");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /school-requests/mine — lets the requester check their own request's
// status (pending/approved/rejected) after logging back in.
router.get("/school-requests/mine", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from("school_creation_requests")
      .select("*")
      .eq("requester_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data ? mapRequest(data) : null);
  } catch (err) {
    logger.error({ err }, "Failed to fetch own school request");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /school-requests — super admin review queue.
router.get(
  "/school-requests",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { status } = req.query as { status?: string };
      let query = supabaseAdmin.from("school_creation_requests").select("*").order("created_at", { ascending: false });
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json((data ?? []).map(mapRequest));
    } catch (err) {
      logger.error({ err }, "Failed to list school requests");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /school-requests/:id/approve — creates the school, promotes the
// requester to admin, and marks the request approved. This is the future
// hook point for payment-plan selection: once plans exist, this becomes
// "requester picks a plan" instead of an immediate free creation.
router.post(
  "/school-requests/:id/approve",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const { data: request, error: fetchError } = await supabaseAdmin
        .from("school_creation_requests")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !request) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      if (request.status !== "pending") {
        res.status(409).json({ error: `This request was already ${request.status}.` });
        return;
      }

      const baseSlug = (request.suggested_school_name as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "") || "school";

      let slug = baseSlug;
      for (let attempt = 0; attempt < 25; attempt++) {
        const { data: conflict } = await supabaseAdmin.from("schools").select("id").eq("slug", slug).maybeSingle();
        if (!conflict) break;
        slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const { data: school, error: schoolError } = await supabaseAdmin
        .from("schools")
        .insert({
          name: request.suggested_school_name,
          slug,
          owner_id: request.requester_id,
          primary_color: "#6E5238",
          secondary_color: "#B58F5E",
          is_active: true,
        })
        .select()
        .single();

      if (schoolError || !school) {
        res.status(500).json({ error: schoolError?.message ?? "Failed to create school" });
        return;
      }

      await supabaseAdmin
        .from("profiles")
        .update({ school_id: school.id, role: "admin" })
        .eq("id", request.requester_id);

      invalidateCachedProfile(request.requester_id as string);

      const { error: updateError } = await supabaseAdmin
        .from("school_creation_requests")
        .update({
          status: "approved",
          reviewed_by: req.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) {
        logger.error({ err: updateError }, "School created but failed to mark request approved");
      }

      notifyUsers({
        userIds: [request.requester_id as string],
        type: "school_request_approved",
        category: "platform",
        title: "Your school was approved!",
        body: `"${school.name}" is ready. You're now the admin — log in to get started.`,
        link: "/dashboard/admin",
      }).catch((err) => logger.error({ err }, "Failed to notify requester of approval"));

      res.json({ id, status: "approved", school: mapSchoolBrief(school) });
    } catch (err) {
      logger.error({ err }, "Failed to approve school request");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /school-requests/:id/reject
router.post(
  "/school-requests/:id/reject",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { notes } = req.body as { notes?: string };

      const { data: request, error: fetchError } = await supabaseAdmin
        .from("school_creation_requests")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !request) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      if (request.status !== "pending") {
        res.status(409).json({ error: `This request was already ${request.status}.` });
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("school_creation_requests")
        .update({
          status: "rejected",
          reviewed_by: req.userId,
          reviewed_at: new Date().toISOString(),
          review_notes: notes?.trim() || null,
        })
        .eq("id", id);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      notifyUsers({
        userIds: [request.requester_id as string],
        type: "school_request_rejected",
        category: "platform",
        title: "Your school request was not approved",
        body: notes?.trim()
          ? `Your request for "${request.suggested_school_name}" was declined: ${notes.trim()}`
          : `Your request for "${request.suggested_school_name}" was declined.`,
      }).catch((err) => logger.error({ err }, "Failed to notify requester of rejection"));

      res.json({ id, status: "rejected" });
    } catch (err) {
      logger.error({ err }, "Failed to reject school request");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

function mapSchoolBrief(s: Record<string, unknown>) {
  return { id: s.id, name: s.name, slug: s.slug };
}

export default router;
