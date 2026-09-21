import { Router, type IRouter, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { notifyUsers } from "../lib/notifications";
import { invalidateCachedProfile, invalidateCachedProfilesForSchool } from "../lib/profileCache";
import { invalidateFeatureCache } from "../lib/featureFlags";
import { estimateCostCents } from "../lib/usageTracking";

const router: IRouter = Router();

// ─── Super Admin Guard ────────────────────────────────────────────────────────
const requireSuperAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.userRole !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
};

// Helper: write to platform_audit_log
async function auditLog(params: {
  actorId?: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  await supabaseAdmin.from("platform_audit_log").insert({
    actor_id: params.actorId ?? null,
    actor_email: params.actorEmail ?? null,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    target_name: params.targetName ?? null,
    details: params.details ?? null,
    ip_address: params.ipAddress ?? null,
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get(
  "/super-admin/dashboard",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [
        schoolsRes,
        usersRes,
        studentsRes,
        teachersRes,
        coursesRes,
        enrollmentsRes,
        applicationsRes,
        newSchoolsRes,
        newUsersRes,
        pendingDeletionRes,
        archiveRes,
        recentSignupsRes,
      ] = await Promise.all([
        supabaseAdmin.from("schools").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "student"),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "teacher"),
        supabaseAdmin.from("courses").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("course_enrollments").select("student_id", { count: "exact", head: true }),
        supabaseAdmin.from("student_applications").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("schools")
          .select("id", { count: "exact", head: true })
          .gte("created_at", firstOfMonth),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", firstOfMonth),
        supabaseAdmin
          .from("school_deletion_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabaseAdmin
          .from("school_archive")
          .select("id", { count: "exact", head: true })
          .is("restored_at", null)
          .is("permanently_deleted_at", null),
        supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, role, school_id, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      // Active schools: schools that have at least 1 student profile
      const { data: activeSchoolRows } = await supabaseAdmin
        .from("profiles")
        .select("school_id")
        .eq("role", "student")
        .not("school_id", "is", null);

      const activeSchoolIds = new Set((activeSchoolRows ?? []).map((r) => r.school_id));

      // Enrich recent signups with school name
      const recentSignups = await Promise.all(
        (recentSignupsRes.data ?? []).map(async (p) => {
          let schoolName: string | null = null;
          if (p.school_id) {
            const { data: sc } = await supabaseAdmin
              .from("schools")
              .select("name")
              .eq("id", p.school_id)
              .single();
            schoolName = sc?.name ?? null;
          }
          return {
            id: p.id,
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
            role: p.role,
            school: schoolName,
            joined: p.created_at,
          };
        })
      );

      // Field names match what SuperAdminDashboard.tsx's DashboardData
      // interface actually reads — this endpoint used to return snake_case
      // (total_schools, recent_signups, ...) while the frontend read
      // camelCase (totalSchools, recentSignups, ...), so every field came
      // back undefined and dashboardData.recentSignups.map() threw on
      // every single visit to the super admin dashboard's default tab.
      res.json({
        totalSchools: schoolsRes.count ?? 0,
        totalUsers: usersRes.count ?? 0,
        totalStudents: studentsRes.count ?? 0,
        totalTeachers: teachersRes.count ?? 0,
        activeCourses: coursesRes.count ?? 0,
        totalEnrollments: enrollmentsRes.count ?? 0,
        totalApplications: applicationsRes.count ?? 0,
        newSchoolsThisMonth: newSchoolsRes.count ?? 0,
        newUsersThisMonth: newUsersRes.count ?? 0,
        activeSchools: activeSchoolIds.size,
        pendingDeletions: pendingDeletionRes.count ?? 0,
        archivedSchools: archiveRes.count ?? 0,
        recentSignups,
      });
    } catch (err) {
      console.error("Dashboard error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Schools List ─────────────────────────────────────────────────────────────
router.get(
  "/super-admin/schools",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { status, search } = req.query as Record<string, string>;

      let query = supabaseAdmin
        .from("schools")
        .select(
          "id, name, slug, owner_id, is_active, created_at, deleted_at, plan, subscription_status, billing_amount_cents, trial_ends_at, enabled_features, custom_domain, custom_domain_status, stripe_connect_status, stripe_connect_charges_enabled"
        );

      if (status === "active") query = query.eq("is_active", true).is("deleted_at", null);
      else if (status === "inactive") query = query.eq("is_active", false).is("deleted_at", null);
      else if (status === "archived") query = query.not("deleted_at", "is", null);

      if (search) query = query.ilike("name", `%${search}%`);

      query = query.order("created_at", { ascending: false });

      const { data: schools, error } = await query;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Batched lookups instead of 3 queries PER school — the old code ran
      // Promise.all([...]) inside a per-school .map(), so N schools meant up
      // to 3*N concurrent queries fired at once, which can exhaust the DB
      // connection pool and fail the whole request once there's more than a
      // handful of schools (the exact same N+1 pattern fixed on the Users
      // list route above).
      const schoolIds = (schools ?? []).map((s) => s.id as string);
      const ownerIds = Array.from(
        new Set((schools ?? []).map((s) => s.owner_id).filter((id): id is string => !!id))
      );

      const [ownersRes, roleRowsRes, courseRowsRes] = await Promise.all([
        ownerIds.length
          ? supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", ownerIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        schoolIds.length
          ? supabaseAdmin.from("profiles").select("school_id, role").in("school_id", schoolIds)
          : Promise.resolve({ data: [] as { school_id: string; role: string }[] }),
        schoolIds.length
          ? supabaseAdmin.from("courses").select("school_id").in("school_id", schoolIds)
          : Promise.resolve({ data: [] as { school_id: string }[] }),
      ]);

      const ownerById = new Map(
        (ownersRes.data ?? []).map((o: any) => [o.id as string, o as { first_name?: string; last_name?: string; email?: string }])
      );

      const roleCountsBySchool = new Map<string, Record<string, number>>();
      for (const row of (roleRowsRes.data as { school_id: string; role: string }[] | null) ?? []) {
        if (!row.school_id) continue;
        const counts = roleCountsBySchool.get(row.school_id) ?? {};
        counts[row.role] = (counts[row.role] ?? 0) + 1;
        roleCountsBySchool.set(row.school_id, counts);
      }

      const courseCountBySchool = new Map<string, number>();
      for (const row of (courseRowsRes.data as { school_id: string }[] | null) ?? []) {
        courseCountBySchool.set(row.school_id, (courseCountBySchool.get(row.school_id) ?? 0) + 1);
      }

      const enriched = (schools ?? []).map((school) => {
        const owner = school.owner_id ? ownerById.get(school.owner_id as string) : null;
        const ownerEmail = owner?.email ?? null;
        const ownerName = owner ? `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() : null;

        const roleCounts = roleCountsBySchool.get(school.id as string) ?? {};
        const totalUsers = Object.values(roleCounts).reduce((sum, n) => sum + n, 0);

        return {
          id: school.id,
          name: school.name,
          slug: school.slug,
          // Field names the frontend table actually reads
          owner: ownerName || ownerEmail || "—",
          status: school.is_active ? "active" : "inactive",
          created: school.created_at,
          // Kept for any other consumer relying on the older shape
          owner_name: ownerName,
          owner_email: ownerEmail,
          students: roleCounts.student ?? 0,
          teachers: roleCounts.teacher ?? 0,
          courses: courseCountBySchool.get(school.id as string) ?? 0,
          // Aggregate role breakdown only — no per-user data included.
          totalUsers,
          roleCounts,
          is_active: school.is_active,
          created_at: school.created_at,
          stripeConnectStatus: school.stripe_connect_status ?? "not_connected",
          stripeChargesEnabled: school.stripe_connect_charges_enabled ?? false,
          details: {
            plan: school.plan ?? "free",
            subscription_status: school.subscription_status ?? "active",
            billing_amount: `$${(((school.billing_amount_cents as number) ?? 0) / 100).toFixed(2)}/mo`,
            custom_domain: school.custom_domain ?? "none",
            custom_domain_status: school.custom_domain_status ?? "unset",
          },
        };
      });

      res.json(enriched);
    } catch (err) {
      console.error("Schools list error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Quick Delete (empty schools only) ───────────────────────────────────────
router.delete(
  "/super-admin/schools/:id/quick-delete",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { data: school, error: schoolErr } = await supabaseAdmin
        .from("schools")
        .select("id, name")
        .eq("id", id)
        .single();

      if (schoolErr || !school) {
        res.status(404).json({ error: "School not found" });
        return;
      }

      const [studentsRes, teachersRes, coursesRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", id).eq("role", "student"),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", id).eq("role", "teacher"),
        supabaseAdmin.from("courses").select("id", { count: "exact", head: true }).eq("school_id", id),
      ]);

      // If any count query errored, refuse to delete rather than risk deleting a non-empty school
      if (studentsRes.error || teachersRes.error || coursesRes.error) {
        res.status(500).json({ error: "Could not verify school is empty. Please try again." });
        return;
      }

      const students = studentsRes.count ?? 0;
      const teachers = teachersRes.count ?? 0;
      const courses = coursesRes.count ?? 0;

      if (students > 0 || teachers > 0 || courses > 0) {
        res.status(400).json({
          error: `School is not empty (${students} students, ${teachers} teachers, ${courses} courses). Use the standard deletion workflow.`,
        });
        return;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("schools")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: "Failed to delete school: " + updateErr.message });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: "school_quick_deleted",
        targetType: "school",
        targetId: id,
        targetName: school.name,
        details: { reason: "empty_school_quick_delete" },
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Quick delete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── School Detail ────────────────────────────────────────────────────────────
router.get(
  "/super-admin/schools/:id",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const [schoolRes, usersRes, coursesRes, recentActivityRes] = await Promise.all([
        supabaseAdmin.from("schools").select("*").eq("id", id).single(),
        supabaseAdmin.from("profiles").select("*").eq("school_id", id).order("created_at", { ascending: false }),
        supabaseAdmin.from("courses").select("*").eq("school_id", id).order("created_at", { ascending: false }),
        supabaseAdmin
          .from("platform_audit_log")
          .select("*")
          .eq("target_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (schoolRes.error || !schoolRes.data) {
        res.status(404).json({ error: "School not found" });
        return;
      }

      res.json({
        school: schoolRes.data,
        users: usersRes.data ?? [],
        courses: coursesRes.data ?? [],
        recent_activity: recentActivityRes.data ?? [],
      });
    } catch (err) {
      console.error("School detail error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Toggle School Active ─────────────────────────────────────────────────────
router.patch(
  "/super-admin/schools/:id/toggle-active",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const { data: school, error: fetchErr } = await supabaseAdmin
        .from("schools")
        .select("id, name, is_active")
        .eq("id", id)
        .single();

      if (fetchErr || !school) {
        res.status(404).json({ error: "School not found" });
        return;
      }

      const newActive = !school.is_active;
      const { error: updateErr } = await supabaseAdmin
        .from("schools")
        .update({ is_active: newActive })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: newActive ? "school_activated" : "school_deactivated",
        targetType: "school",
        targetId: id,
        targetName: school.name,
        ipAddress: req.ip,
      });

      // Suspension/reactivation must take effect immediately, not after the
      // profile cache's TTL expires — every cached user of this school is
      // forced to re-check on their very next request.
      invalidateCachedProfilesForSchool(id);

      res.json({ id, is_active: newActive });
    } catch (err) {
      console.error("Toggle active error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Subscriptions ──────────────────────────────────────────────────────────────
// No payment processor is wired up — plan/status/price are managed manually
// here until real billing is integrated. This is the sales/billing source
// of truth in the meantime.
router.get(
  "/super-admin/subscriptions",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("schools")
        .select("id, name, slug, plan, subscription_status, billing_amount_cents, trial_ends_at, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const schools = data ?? [];
      const activeOrTrialing = schools.filter((s) => s.subscription_status === "active" || s.subscription_status === "trialing");
      const mrrCents = activeOrTrialing.reduce((sum, s) => sum + ((s.billing_amount_cents as number) ?? 0), 0);

      const byPlan: Record<string, number> = { free: 0, basic: 0, pro: 0, enterprise: 0 };
      const byStatus: Record<string, number> = { trialing: 0, active: 0, past_due: 0, canceled: 0 };
      for (const s of schools) {
        byPlan[s.plan as string] = (byPlan[s.plan as string] ?? 0) + 1;
        byStatus[s.subscription_status as string] = (byStatus[s.subscription_status as string] ?? 0) + 1;
      }

      res.json({
        summary: {
          mrr_cents: mrrCents,
          total_schools: schools.length,
          by_plan: byPlan,
          by_status: byStatus,
        },
        schools: schools.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          plan: s.plan,
          subscription_status: s.subscription_status,
          billing_amount_cents: s.billing_amount_cents,
          trial_ends_at: s.trial_ends_at,
          created_at: s.created_at,
        })),
      });
    } catch (err) {
      console.error("Subscriptions list error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.patch(
  "/super-admin/schools/:id/subscription",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { plan, subscription_status, billing_amount_cents, trial_ends_at } = req.body as {
        plan?: string;
        subscription_status?: string;
        billing_amount_cents?: number;
        trial_ends_at?: string | null;
      };

      const updates: Record<string, unknown> = {};
      if (plan !== undefined) updates.plan = plan;
      if (subscription_status !== undefined) updates.subscription_status = subscription_status;
      if (billing_amount_cents !== undefined) updates.billing_amount_cents = billing_amount_cents;
      if (trial_ends_at !== undefined) updates.trial_ends_at = trial_ends_at;

      const { data: school, error } = await supabaseAdmin
        .from("schools")
        .update(updates)
        .eq("id", id)
        .select("id, name")
        .single();

      if (error || !school) {
        res.status(404).json({ error: error?.message ?? "School not found" });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: "subscription_updated",
        targetType: "school",
        targetId: id,
        targetName: school.name,
        details: updates,
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Update subscription error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Per-school feature flags ────────────────────────────────────────────────
router.patch(
  "/super-admin/schools/:id/features",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { enabled_features } = req.body as { enabled_features?: Record<string, boolean> };

      if (!enabled_features || typeof enabled_features !== "object") {
        res.status(400).json({ error: "enabled_features object is required" });
        return;
      }

      const { data: current } = await supabaseAdmin.from("schools").select("enabled_features, name").eq("id", id).single();
      const merged = { ...((current?.enabled_features as Record<string, boolean>) ?? {}), ...enabled_features };

      const { error } = await supabaseAdmin.from("schools").update({ enabled_features: merged }).eq("id", id);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      invalidateFeatureCache(id);

      await auditLog({
        actorId: req.userId,
        action: "feature_flags_updated",
        targetType: "school",
        targetId: id,
        targetName: current?.name,
        details: enabled_features,
        ipAddress: req.ip,
      });

      res.json({ success: true, enabled_features: merged });
    } catch (err) {
      console.error("Update feature flags error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Users List ───────────────────────────────────────────────────────────────
router.get(
  "/super-admin/users",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { role, school_id, search } = req.query as Record<string, string>;

      let query = supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, role, school_id, internal_email, email, created_at, is_suspended");

      if (role) query = query.eq("role", role);
      if (school_id) query = query.eq("school_id", school_id);
      if (search) {
        // See users.ts's /users/search for why this is stripped down to
        // plain search characters — PostgREST's .or() filter string treats
        // ',', '(', ')' as condition/grouping syntax.
        const safeSearch = String(search).replace(/[^\p{L}\p{N}\s@._-]/gu, "").slice(0, 100);
        query = query.or(
          `first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,internal_email.ilike.%${safeSearch}%`
        );
      }

      query = query.order("created_at", { ascending: false });

      const { data: profiles, error } = await query;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // One batched lookup for every school name instead of a query per
      // user — the old code ran one single-row query per profile, which is
      // an N+1 pattern that can exhaust the DB connection pool (and time
      // out the whole request) once there are more than a handful of users.
      const schoolIds = Array.from(
        new Set((profiles ?? []).map((p) => p.school_id).filter((id): id is string => !!id))
      );
      const { data: schoolsForUsers } = schoolIds.length
        ? await supabaseAdmin.from("schools").select("id, name").in("id", schoolIds)
        : { data: [] as { id: string; name: string }[] };
      const schoolNameById = new Map((schoolsForUsers ?? []).map((s) => [s.id, s.name as string]));

      const enriched = (profiles ?? []).map((p) => ({
        id: p.id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        email: p.email ?? null,
        internal_email: p.internal_email,
        role: p.role,
        school: p.school_id ? schoolNameById.get(p.school_id as string) ?? null : null,
        joined: p.created_at,
        suspended: p.is_suspended === true,
      }));

      res.json(enriched);
    } catch (err) {
      console.error("Users list error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Change User Role ─────────────────────────────────────────────────────────
router.patch(
  "/super-admin/users/:id/role",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { role } = req.body as { role: string };

      const VALID_ROLES = ["super_admin", "admin", "teacher", "staff", "student"];
      if (!role || !VALID_ROLES.includes(role)) {
        res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
        return;
      }

      // A super admin changing their own role (a misclick on the same row
      // they're using to manage everyone else) would lock them out of the
      // console that's the only place this can be undone.
      if (id === req.userId) {
        res.status(400).json({ error: "You cannot change your own role" });
        return;
      }

      const { data: profile, error: fetchErr } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("id", id)
        .single();

      if (fetchErr || !profile) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update({ role })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      invalidateCachedProfile(id);

      await auditLog({
        actorId: req.userId,
        action: "user_role_changed",
        targetType: "user",
        targetId: id,
        targetName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
        details: { old_role: profile.role, new_role: role },
        ipAddress: req.ip,
      });

      res.json({ id, role });
    } catch (err) {
      console.error("Change role error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Suspend / Unsuspend User ─────────────────────────────────────────────────
router.patch(
  "/super-admin/users/:id/suspend",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { suspended } = req.body as { suspended: boolean };

      const { data: profile, error: fetchErr } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("id", id)
        .single();

      if (fetchErr || !profile) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update({ is_suspended: suspended })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: suspended ? "user_suspended" : "user_unsuspended",
        targetType: "user",
        targetId: id,
        targetName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
        ipAddress: req.ip,
      });

      res.json({ id, is_suspended: suspended });
    } catch (err) {
      console.error("Suspend user error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Delete User ──────────────────────────────────────────────────────────────
router.delete(
  "/super-admin/users/:id",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("id", id)
        .single();

      // Delete from auth (cascades to profiles via DB trigger if set, or delete manually)
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (authErr) {
        res.status(500).json({ error: authErr.message });
        return;
      }

      // Delete profile (in case no cascade)
      await supabaseAdmin.from("profiles").delete().eq("id", id);

      await auditLog({
        actorId: req.userId,
        action: "user_permanently_deleted",
        targetType: "user",
        targetId: id,
        targetName: profile
          ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
          : id,
        ipAddress: req.ip,
      });

      res.json({ success: true, deleted_id: id });
    } catch (err) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Platform Analytics ───────────────────────────────────────────────────────
router.get(
  "/super-admin/analytics",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Build last 12 months array
      const months: string[] = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toISOString().slice(0, 7)); // "YYYY-MM"
      }

      // Schools growth: count schools created per month
      const { data: schoolsData } = await supabaseAdmin
        .from("schools")
        .select("created_at")
        .gte("created_at", `${months[0]}-01`);

      const schoolsGrowth = months.map((m) => ({
        month: m,
        count: (schoolsData ?? []).filter((s) => s.created_at.startsWith(m)).length,
      }));

      // Users growth per month per role
      const { data: usersData } = await supabaseAdmin
        .from("profiles")
        .select("created_at, role")
        .gte("created_at", `${months[0]}-01`);

      const usersGrowth = months.map((m) => {
        const monthUsers = (usersData ?? []).filter((u) => u.created_at.startsWith(m));
        return {
          month: m,
          students: monthUsers.filter((u) => u.role === "student").length,
          teachers: monthUsers.filter((u) => u.role === "teacher").length,
          admins: monthUsers.filter((u) => u.role === "admin" || u.role === "super_admin").length,
        };
      });

      // Enrollments by month
      const { data: enrollmentsData } = await supabaseAdmin
        .from("course_enrollments")
        .select("enrolled_at")
        .gte("enrolled_at", `${months[0]}-01`);

      const enrollmentsByMonth = months.map((m) => ({
        month: m,
        count: (enrollmentsData ?? []).filter((e) => (e.enrolled_at ?? "").startsWith(m)).length,
      }));

      // Top 10 schools by enrollment
      const { data: allEnrollments } = await supabaseAdmin
        .from("course_enrollments")
        .select("course_id");

      const { data: allCourses } = await supabaseAdmin
        .from("courses")
        .select("id, school_id");

      const { data: allSchools } = await supabaseAdmin.from("schools").select("id, name");

      const schoolEnrollmentMap: Record<string, number> = {};
      for (const enrollment of allEnrollments ?? []) {
        const course = (allCourses ?? []).find((c) => c.id === enrollment.course_id);
        if (course?.school_id) {
          schoolEnrollmentMap[course.school_id] =
            (schoolEnrollmentMap[course.school_id] ?? 0) + 1;
        }
      }

      const topSchools = Object.entries(schoolEnrollmentMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([schoolId, count]) => {
          const school = (allSchools ?? []).find((s) => s.id === schoolId);
          return { name: school?.name ?? schoolId, students: count };
        });

      // Application stats
      const { data: appsData } = await supabaseAdmin
        .from("student_applications")
        .select("status");

      const applicationStats = {
        total: appsData?.length ?? 0,
        approved: (appsData ?? []).filter((a) => a.status === "accepted" || a.status === "enrolled").length,
        rejected: (appsData ?? []).filter((a) => a.status === "rejected").length,
        pending: (appsData ?? []).filter((a) => a.status === "submitted" || a.status === "under_review").length,
      };

      // Same class of bug as the dashboard route: this used to return
      // snake_case while AnalyticsData in SuperAdminDashboard.tsx reads
      // camelCase, so analyticsData.topSchools was always undefined and
      // .map() threw the moment anyone opened the Analytics tab.
      res.json({
        schoolsGrowth,
        usersGrowth,
        enrollmentsByMonth,
        topSchools,
        applicationStats,
        geographicDistribution: {},
      });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Audit Log ────────────────────────────────────────────────────────────────
router.get(
  "/super-admin/audit-log",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { actor_id, action, target_type, from, to, page = "1", limit = "50" } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
      const offset = (pageNum - 1) * limitNum;

      let query = supabaseAdmin
        .from("platform_audit_log")
        .select("id, actor_id, actor_email, action, target_type, target_id, target_name, details, ip_address, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (actor_id) query = query.eq("actor_id", actor_id);
      if (action) query = query.eq("action", action);
      if (target_type) query = query.eq("target_type", target_type);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);

      const { data, error, count } = await query;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Enrich with actor name from profiles
      const enriched = await Promise.all(
        (data ?? []).map(async (entry) => {
          let actorName: string | null = null;
          if (entry.actor_id) {
            const { data: p } = await supabaseAdmin
              .from("profiles")
              .select("first_name, last_name")
              .eq("id", entry.actor_id)
              .single();
            if (p) actorName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
          }
          return { ...entry, actor_name: actorName ?? entry.actor_email };
        })
      );

      // SuperAdminDashboard.tsx's fetchAuditLogs does setAuditLogs(await
      // res.json()) expecting a plain array (AuditLog[]) — this used to send
      // {data, total, page, limit} instead, so auditLogs.map() threw the
      // moment anyone opened the Audit Log tab. Pagination metadata goes in
      // a header instead of changing the body shape.
      res.set("X-Total-Count", String(count ?? 0));
      res.json(enriched);
    } catch (err) {
      console.error("Audit log error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Deletion Requests ────────────────────────────────────────────────────────
router.get(
  "/super-admin/deletion-requests",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("school_deletion_requests")
        .select("*, schools(name, slug), profiles!requested_by(first_name, last_name)")
        .order("status")
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Raw Supabase rows (with nested schools/profiles joins) were sent
      // directly — SuperAdminDashboard.tsx's DeletionRequest interface
      // reads flat camelCase fields (school, requester, requestedAt) that
      // never existed on this shape, so every row rendered blank names and
      // "Invalid Date".
      const mapped = (data ?? []).map((r: any) => ({
        id: r.id,
        schoolId: r.school_id,
        school: r.schools?.name ?? r.school_id,
        requester: r.profiles ? `${r.profiles.first_name ?? ""} ${r.profiles.last_name ?? ""}`.trim() : null,
        reason: r.reason,
        status: r.status,
        requestedAt: r.created_at,
        reviewNotes: r.review_notes ?? null,
      }));

      res.json(mapped);
    } catch (err) {
      console.error("Deletion requests error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/super-admin/deletion-requests/:id/approve",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { data: request, error: fetchErr } = await supabaseAdmin
        .from("school_deletion_requests")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !request) {
        res.status(404).json({ error: "Deletion request not found" });
        return;
      }

      if (request.status !== "pending") {
        res.status(400).json({ error: "Request is not in pending status" });
        return;
      }

      // Fetch school snapshot
      const { data: school } = await supabaseAdmin
        .from("schools")
        .select("*")
        .eq("id", request.school_id)
        .single();

      // course_enrollments has no school_id column — it only links a course to
      // a student — so the enrollment count has to go through the school's
      // course ids. Filtering enrollments on school_id made this query error
      // out and the archived stats snapshot record 0 enrollments.
      const { data: schoolCourseRows } = await supabaseAdmin
        .from("courses")
        .select("id")
        .eq("school_id", request.school_id);
      const schoolCourseIds = (schoolCourseRows ?? []).map((c) => c.id as string);

      // Gather stats snapshot
      const [studentsRes, teachersRes, coursesRes, enrollmentsRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("school_id", request.school_id)
          .eq("role", "student"),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("school_id", request.school_id)
          .eq("role", "teacher"),
        supabaseAdmin
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("school_id", request.school_id),
        schoolCourseIds.length > 0
          ? supabaseAdmin
              .from("course_enrollments")
              .select("student_id", { count: "exact", head: true })
              .in("course_id", schoolCourseIds)
          : Promise.resolve({ count: 0 } as { count: number }),
      ]);

      // Create archive record
      await supabaseAdmin.from("school_archive").insert({
        school_id: request.school_id,
        school_data: school ?? {},
        stats_snapshot: {
          students: studentsRes.count ?? 0,
          teachers: teachersRes.count ?? 0,
          courses: coursesRes.count ?? 0,
          enrollments: enrollmentsRes.count ?? 0,
        },
        deleted_by: req.userId,
        deletion_request_id: id,
      });

      // Update request status
      const { error: updateErr } = await supabaseAdmin
        .from("school_deletion_requests")
        .update({
          status: "approved",
          reviewed_by: req.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: "deletion_request_approved",
        targetType: "school",
        targetId: request.school_id,
        targetName: request.school_name,
        ipAddress: req.ip,
      });

      res.json({ success: true, status: "approved" });
    } catch (err) {
      console.error("Approve deletion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/super-admin/deletion-requests/:id/reject",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { review_notes } = req.body as { review_notes?: string };

      const { data: request, error: fetchErr } = await supabaseAdmin
        .from("school_deletion_requests")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !request) {
        res.status(404).json({ error: "Deletion request not found" });
        return;
      }

      if (request.status !== "pending") {
        res.status(400).json({ error: "Request is not in pending status" });
        return;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("school_deletion_requests")
        .update({
          status: "rejected",
          reviewed_by: req.userId,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes ?? null,
        })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: "deletion_request_rejected",
        targetType: "school",
        targetId: request.school_id,
        targetName: request.school_name,
        details: { review_notes },
        ipAddress: req.ip,
      });

      res.json({ success: true, status: "rejected" });
    } catch (err) {
      console.error("Reject deletion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Execute School Deletion (Soft Delete) ────────────────────────────────────
router.post(
  "/super-admin/schools/:id/execute-deletion",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Verify approved deletion request exists
      const { data: request, error: reqErr } = await supabaseAdmin
        .from("school_deletion_requests")
        .select("*")
        .eq("school_id", id)
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false })
        .limit(1)
        .single();

      if (reqErr || !request) {
        res.status(400).json({ error: "No approved deletion request found for this school" });
        return;
      }

      const deletedAt = new Date().toISOString();

      // Soft-delete: mark school inactive and set deleted_at
      const { error: updateErr } = await supabaseAdmin
        .from("schools")
        .update({ is_active: false, deleted_at: deletedAt })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      // Mark deletion request as completed
      await supabaseAdmin
        .from("school_deletion_requests")
        .update({ status: "completed" })
        .eq("id", request.id);

      await auditLog({
        actorId: req.userId,
        action: "school_soft_deleted",
        targetType: "school",
        targetId: id,
        targetName: request.school_name,
        details: { deletion_request_id: request.id, deleted_at: deletedAt },
        ipAddress: req.ip,
      });

      res.json({ success: true, deleted_at: deletedAt, restore_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
    } catch (err) {
      console.error("Execute deletion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Direct School Deletion (super admin, no deletion request needed) ─────────
// The request -> approve -> execute pipeline above exists for a school's OWN
// admin to ask for deletion. A super admin needs to be able to delete any
// school directly (e.g. for a non-compliant or abandoned school) without
// waiting on that school's admin to request it first — this does the same
// archive-snapshot-then-soft-delete as execute-deletion, in one step, with
// the same 30-day restore window (school_archive.restore_deadline's DB
// default) so it's never an irreversible action.
router.post(
  "/super-admin/schools/:id/delete",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { reason } = req.body as { reason?: string };

      const { data: school, error: schoolErr } = await supabaseAdmin
        .from("schools")
        .select("*")
        .eq("id", id)
        .single();

      if (schoolErr || !school) {
        res.status(404).json({ error: "School not found" });
        return;
      }

      if (school.deleted_at) {
        res.status(400).json({ error: "This school is already deleted" });
        return;
      }

      const [studentsRes, teachersRes, coursesRes, enrollmentsRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", id).eq("role", "student"),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", id).eq("role", "teacher"),
        supabaseAdmin.from("courses").select("id", { count: "exact", head: true }).eq("school_id", id),
        // course_enrollments has no school_id column (it's keyed only by
        // course_id + student_id), so filtering on one made this query error
        // out and the archived snapshot always recorded 0 enrollments.
        // Scope through the joined course instead.
        supabaseAdmin
          .from("course_enrollments")
          .select("student_id, courses!inner(school_id)", { count: "exact", head: true })
          .eq("courses.school_id", id),
      ]);

      const { data: archiveEntry, error: archiveErr } = await supabaseAdmin
        .from("school_archive")
        .insert({
          school_id: id,
          school_data: school,
          stats_snapshot: {
            students: studentsRes.count ?? 0,
            teachers: teachersRes.count ?? 0,
            courses: coursesRes.count ?? 0,
            enrollments: enrollmentsRes.count ?? 0,
          },
          deleted_by: req.userId,
          deletion_request_id: null,
        })
        .select("restore_deadline")
        .single();

      if (archiveErr) {
        res.status(500).json({ error: archiveErr.message });
        return;
      }

      const deletedAt = new Date().toISOString();
      const { error: updateErr } = await supabaseAdmin
        .from("schools")
        .update({ is_active: false, deleted_at: deletedAt })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: "school_deleted_directly",
        targetType: "school",
        targetId: id,
        targetName: school.name,
        details: { reason: reason ?? null, restore_deadline: archiveEntry?.restore_deadline },
        ipAddress: req.ip,
      });

      res.json({ success: true, deleted_at: deletedAt, restore_deadline: archiveEntry?.restore_deadline });
    } catch (err) {
      console.error("Direct school deletion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Custom Domain Requests ─────────────────────────────────────────────────────
router.get(
  "/super-admin/domain-requests",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("schools")
        .select("id, name, slug, custom_domain, custom_domain_status, custom_domain_requested_at")
        .not("custom_domain", "is", null)
        .order("custom_domain_requested_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const statusOrder: Record<string, number> = { requested: 0, failed: 1, approved: 2, verified: 3 };
      const sorted = (data ?? []).slice().sort((a, b) => {
        const aOrder = statusOrder[a.custom_domain_status as string] ?? 99;
        const bOrder = statusOrder[b.custom_domain_status as string] ?? 99;
        return aOrder - bOrder;
      });

      res.json(
        sorted.map((s) => ({
          schoolId: s.id,
          schoolName: s.name,
          slug: s.slug,
          domain: s.custom_domain,
          status: s.custom_domain_status,
          requestedAt: s.custom_domain_requested_at,
        }))
      );
    } catch (err) {
      console.error("Domain requests list error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// One-click approve: called after the super-admin has manually added the
// domain in the hosting provider's domain settings. Generates the DNS
// records and notifies the school admin(s) to complete verification.
router.post(
  "/super-admin/schools/:id/custom-domain/approve",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { data: school, error: fetchErr } = await supabaseAdmin
        .from("schools")
        .select("id, name, custom_domain, custom_domain_status")
        .eq("id", id)
        .single();

      if (fetchErr || !school?.custom_domain) {
        res.status(404).json({ error: "No domain request found for this school" });
        return;
      }

      const token = randomBytes(16).toString("hex");
      const { error: updateErr } = await supabaseAdmin
        .from("schools")
        .update({ custom_domain_status: "approved", custom_domain_token: token })
        .eq("id", id);

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      const { data: admins } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("school_id", id)
        .in("role", ["admin", "super_admin"]);
      const adminIds = (admins ?? []).map((p) => p.id as string);
      if (adminIds.length > 0) {
        await notifyUsers({
          userIds: adminIds,
          type: "domain_approved",
          category: "platform",
          title: "Your custom domain is ready to verify",
          body: `${school.custom_domain} has been approved. Go to Settings -> Branding -> Custom Domain to add the DNS records and finish connecting it.`,
          link: "/dashboard/admin/branding",
        });
      }

      await auditLog({
        actorId: req.userId,
        action: "custom_domain_approved",
        targetType: "school",
        targetId: id,
        targetName: school.name,
        details: { domain: school.custom_domain },
        ipAddress: req.ip,
      });

      res.json({ success: true, status: "approved" });
    } catch (err) {
      console.error("Approve custom domain error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Archive ──────────────────────────────────────────────────────────────────
router.get(
  "/super-admin/archive",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("school_archive")
        .select("id, school_id, school_data, stats_snapshot, restore_deadline, restored_at, permanently_deleted_at, created_at")
        .is("restored_at", null)
        .is("permanently_deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const now = Date.now();
      const enriched = (data ?? []).map((entry) => {
        const deadline = new Date(entry.restore_deadline).getTime();
        const daysRemaining = Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)));
        const schoolData = entry.school_data as Record<string, unknown>;
        return {
          id: entry.id,
          schoolId: entry.school_id,
          schoolName: schoolData?.name ?? null,
          deletedAt: entry.created_at,
          daysRemaining: daysRemaining,
          expired: daysRemaining <= 0,
        };
      });

      res.json(enriched);
    } catch (err) {
      console.error("Archive list error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/super-admin/archive/:id/restore",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { data: archiveEntry, error: fetchErr } = await supabaseAdmin
        .from("school_archive")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !archiveEntry) {
        res.status(404).json({ error: "Archive entry not found" });
        return;
      }

      if (archiveEntry.restored_at) {
        res.status(400).json({ error: "School already restored" });
        return;
      }

      const deadline = new Date(archiveEntry.restore_deadline).getTime();
      if (Date.now() > deadline) {
        res.status(400).json({ error: "Restore deadline has passed (30-day window expired)" });
        return;
      }

      // Restore school: set is_active=true, clear deleted_at
      const { error: restoreErr } = await supabaseAdmin
        .from("schools")
        .update({ is_active: true, deleted_at: null })
        .eq("id", archiveEntry.school_id);

      if (restoreErr) {
        res.status(500).json({ error: restoreErr.message });
        return;
      }

      // Mark archive entry as restored
      await supabaseAdmin
        .from("school_archive")
        .update({ restored_at: new Date().toISOString() })
        .eq("id", id);

      // Mark any completed deletion request back if needed
      await supabaseAdmin
        .from("school_deletion_requests")
        .update({ status: "rejected", review_notes: "Restored by super admin" })
        .eq("id", archiveEntry.deletion_request_id);

      const schoolData = archiveEntry.school_data as Record<string, unknown>;
      await auditLog({
        actorId: req.userId,
        action: "school_restored",
        targetType: "school",
        targetId: String(archiveEntry.school_id),
        targetName: String(schoolData?.name ?? archiveEntry.school_id),
        details: { archive_id: id },
        ipAddress: req.ip,
      });

      res.json({ success: true, school_id: archiveEntry.school_id });
    } catch (err) {
      console.error("Restore archive error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Platform Settings ────────────────────────────────────────────────────────
router.get(
  "/super-admin/platform-settings",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("platform_settings")
        .select("key, value, updated_by, updated_at")
        .order("key");

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // SuperAdminDashboard.tsx's `settings` state is a single
      // PlatformSettings object read via settings.maxSchoolsPerAdmin, etc. —
      // this was sending the raw key/value rows as an array instead, so
      // every setting field silently read as undefined.
      const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
      const maintenance = (byKey.get("maintenanceMode") as { mode?: boolean; message?: string } | undefined) ?? {};

      res.json({
        maxSchoolsPerAdmin: byKey.get("maxSchoolsPerAdmin") ?? 0,
        maxStudentsPerSchool: byKey.get("maxStudentsPerSchool") ?? 0,
        maxCoursesPerSchool: byKey.get("maxCoursesPerSchool") ?? 0,
        allowSchoolRegistration: byKey.get("allowSchoolRegistration") ?? true,
        maintenanceMode: maintenance.mode ?? false,
        maintenanceMessage: maintenance.message ?? "",
      });
    } catch (err) {
      console.error("Platform settings get error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.put(
  "/super-admin/platform-settings",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { key, value } = req.body as { key: string; value: unknown };

      if (!key) {
        res.status(400).json({ error: "key is required" });
        return;
      }

      const { error } = await supabaseAdmin
        .from("platform_settings")
        .upsert({
          key,
          value,
          updated_by: req.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("key", key);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      await auditLog({
        actorId: req.userId,
        action: "platform_setting_updated",
        targetType: "platform",
        targetId: key,
        targetName: key,
        details: { value },
        ipAddress: req.ip,
      });

      res.json({ success: true, key, value });
    } catch (err) {
      console.error("Platform settings update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Usage & Costs ──────────────────────────────────────────────────────────
// Per-school and per-user usage visibility (AI tokens/estimated cost, chat
// messages, forum posts, video calls) — for spotting where AI cost is
// coming from, informing a plan-upgrade conversation with a school, or
// deciding where to cap usage later.

router.get(
  "/super-admin/usage",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const days = Math.min(365, Math.max(1, parseInt((req.query.days as string) ?? "30", 10) || 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: events, error }, { data: schools }, { data: tuitionPayments }, { data: expenseRows }] = await Promise.all([
        supabaseAdmin
          .from("usage_events")
          .select("school_id, event_type, ai_model, input_tokens, output_tokens")
          .gte("created_at", since),
        supabaseAdmin.from("schools").select("id, name"),
        supabaseAdmin
          .from("tuition_payments")
          .select("school_id, amount_cents, status")
          .eq("status", "paid")
          .gte("created_at", since),
        supabaseAdmin
          .from("expenses")
          .select("school_id, amount_cents")
          .gte("expense_date", since.slice(0, 10)),
      ]);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const schoolNameById = new Map((schools ?? []).map((s) => [s.id as string, s.name as string]));

      const bySchool = new Map<
        string,
        {
          aiMessages: number;
          aiInputTokens: number;
          aiOutputTokens: number;
          estimatedCostCents: number;
          chatMessages: number;
          forumPosts: number;
          videoCalls: number;
          tuitionRevenueCents: number;
          expensesCents: number;
        }
      >();

      const emptyRow = () => ({
        aiMessages: 0,
        aiInputTokens: 0,
        aiOutputTokens: 0,
        estimatedCostCents: 0,
        chatMessages: 0,
        forumPosts: 0,
        videoCalls: 0,
        tuitionRevenueCents: 0,
        expensesCents: 0,
      });

      for (const e of events ?? []) {
        const schoolId = e.school_id as string;
        const row = bySchool.get(schoolId) ?? emptyRow();

        if (e.event_type === "ai_chat") {
          const inputTokens = (e.input_tokens as number) ?? 0;
          const outputTokens = (e.output_tokens as number) ?? 0;
          row.aiMessages += 1;
          row.aiInputTokens += inputTokens;
          row.aiOutputTokens += outputTokens;
          row.estimatedCostCents += estimateCostCents(e.ai_model as string | null, inputTokens, outputTokens);
        } else if (e.event_type === "chat_message") {
          row.chatMessages += 1;
        } else if (e.event_type === "forum_post") {
          row.forumPosts += 1;
        } else if (e.event_type === "video_call") {
          row.videoCalls += 1;
        }

        bySchool.set(schoolId, row);
      }

      for (const p of tuitionPayments ?? []) {
        const schoolId = p.school_id as string;
        const row = bySchool.get(schoolId) ?? emptyRow();
        row.tuitionRevenueCents += (p.amount_cents as number) ?? 0;
        bySchool.set(schoolId, row);
      }

      for (const e of expenseRows ?? []) {
        const schoolId = e.school_id as string;
        const row = bySchool.get(schoolId) ?? emptyRow();
        row.expensesCents += (e.amount_cents as number) ?? 0;
        bySchool.set(schoolId, row);
      }

      const result = Array.from(bySchool.entries())
        .map(([schoolId, stats]) => ({
          schoolId,
          schoolName: schoolNameById.get(schoolId) ?? "Unknown school",
          ...stats,
          netCents: stats.tuitionRevenueCents - stats.expensesCents,
        }))
        .sort((a, b) => b.estimatedCostCents - a.estimatedCostCents);

      res.json({ days, schools: result });
    } catch (err) {
      console.error("Usage summary error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/super-admin/usage/schools/:id/users",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const schoolId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const days = Math.min(365, Math.max(1, parseInt((req.query.days as string) ?? "30", 10) || 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: events, error } = await supabaseAdmin
        .from("usage_events")
        .select("user_id, event_type, ai_model, input_tokens, output_tokens")
        .eq("school_id", schoolId)
        .gte("created_at", since);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const userIds = Array.from(new Set((events ?? []).map((e) => e.user_id).filter((id): id is string => !!id)));
      const { data: profiles } = userIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, role").in("id", userIds)
        : { data: [] as { id: string; first_name: string | null; last_name: string | null; role: string }[] };
      const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

      const byUser = new Map<
        string,
        {
          aiMessages: number;
          aiInputTokens: number;
          aiOutputTokens: number;
          estimatedCostCents: number;
          chatMessages: number;
          forumPosts: number;
          videoCalls: number;
        }
      >();

      for (const e of events ?? []) {
        if (!e.user_id) continue;
        const userId = e.user_id as string;
        const row =
          byUser.get(userId) ??
          { aiMessages: 0, aiInputTokens: 0, aiOutputTokens: 0, estimatedCostCents: 0, chatMessages: 0, forumPosts: 0, videoCalls: 0 };

        if (e.event_type === "ai_chat") {
          const inputTokens = (e.input_tokens as number) ?? 0;
          const outputTokens = (e.output_tokens as number) ?? 0;
          row.aiMessages += 1;
          row.aiInputTokens += inputTokens;
          row.aiOutputTokens += outputTokens;
          row.estimatedCostCents += estimateCostCents(e.ai_model as string | null, inputTokens, outputTokens);
        } else if (e.event_type === "chat_message") {
          row.chatMessages += 1;
        } else if (e.event_type === "forum_post") {
          row.forumPosts += 1;
        } else if (e.event_type === "video_call") {
          row.videoCalls += 1;
        }

        byUser.set(userId, row);
      }

      const result = Array.from(byUser.entries())
        .map(([userId, stats]) => {
          const profile = profileById.get(userId);
          return {
            userId,
            userName: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Unknown user" : "Unknown user",
            role: profile?.role ?? null,
            ...stats,
          };
        })
        .sort((a, b) => b.estimatedCostCents - a.estimatedCostCents);

      res.json({ days, users: result });
    } catch (err) {
      console.error("Per-user usage error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
