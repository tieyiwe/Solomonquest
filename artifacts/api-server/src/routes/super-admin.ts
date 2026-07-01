import { Router, type IRouter, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

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
        supabaseAdmin.from("enrollments").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("applications").select("id", { count: "exact", head: true }),
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
          .select("first_name, last_name, role, school_id, created_at")
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
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
            role: p.role,
            school: schoolName,
            created_at: p.created_at,
          };
        })
      );

      res.json({
        total_schools: schoolsRes.count ?? 0,
        total_users: usersRes.count ?? 0,
        total_students: studentsRes.count ?? 0,
        total_teachers: teachersRes.count ?? 0,
        total_courses: coursesRes.count ?? 0,
        total_enrollments: enrollmentsRes.count ?? 0,
        total_applications: applicationsRes.count ?? 0,
        new_schools_this_month: newSchoolsRes.count ?? 0,
        new_users_this_month: newUsersRes.count ?? 0,
        active_schools: activeSchoolIds.size,
        pending_deletion_requests: pendingDeletionRes.count ?? 0,
        schools_in_archive: archiveRes.count ?? 0,
        recent_signups: recentSignups,
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
        .select("id, name, slug, owner_id, is_active, created_at, deleted_at");

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

      const enriched = await Promise.all(
        (schools ?? []).map(async (school) => {
          const [ownerRes, studentsRes, teachersRes, coursesRes] = await Promise.all([
            school.owner_id
              ? supabaseAdmin
                  .from("profiles")
                  .select("first_name, last_name")
                  .eq("id", school.owner_id)
                  .single()
              : Promise.resolve({ data: null }),
            supabaseAdmin
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .eq("school_id", school.id)
              .eq("role", "student"),
            supabaseAdmin
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .eq("school_id", school.id)
              .eq("role", "teacher"),
            supabaseAdmin
              .from("courses")
              .select("id", { count: "exact", head: true })
              .eq("school_id", school.id),
          ]);

          // Fetch owner email from auth
          let ownerEmail: string | null = null;
          if (school.owner_id) {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(school.owner_id);
            ownerEmail = authUser?.user?.email ?? null;
          }

          const owner = ownerRes.data as { first_name?: string; last_name?: string } | null;

          return {
            id: school.id,
            name: school.name,
            slug: school.slug,
            owner_name: owner
              ? `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim()
              : null,
            owner_email: ownerEmail,
            students: studentsRes.count ?? 0,
            teachers: teachersRes.count ?? 0,
            courses: coursesRes.count ?? 0,
            is_active: school.is_active,
            created_at: school.created_at,
          };
        })
      );

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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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

      res.json({ id, is_active: newActive });
    } catch (err) {
      console.error("Toggle active error:", err);
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
        .select("id, first_name, last_name, role, school_id, internal_email, created_at");

      if (role) query = query.eq("role", role);
      if (school_id) query = query.eq("school_id", school_id);
      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,internal_email.ilike.%${search}%`
        );
      }

      query = query.order("created_at", { ascending: false });

      const { data: profiles, error } = await query;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const enriched = await Promise.all(
        (profiles ?? []).map(async (p) => {
          let schoolName: string | null = null;
          if (p.school_id) {
            const { data: sc } = await supabaseAdmin
              .from("schools")
              .select("name")
              .eq("id", p.school_id)
              .single();
            schoolName = sc?.name ?? null;
          }

          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(p.id);

          return {
            id: p.id,
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
            email: authUser?.user?.email ?? null,
            internal_email: p.internal_email,
            role: p.role,
            school_name: schoolName,
            created_at: p.created_at,
            last_sign_in: authUser?.user?.last_sign_in_at ?? null,
          };
        })
      );

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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { role } = req.body as { role: string };

      if (!role) {
        res.status(400).json({ error: "role is required" });
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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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
          admins: monthUsers.filter(
            (u) => u.role === "school_admin" || u.role === "super_admin"
          ).length,
        };
      });

      // Enrollments by month
      const { data: enrollmentsData } = await supabaseAdmin
        .from("enrollments")
        .select("created_at")
        .gte("created_at", `${months[0]}-01`);

      const enrollmentsByMonth = months.map((m) => ({
        month: m,
        count: (enrollmentsData ?? []).filter((e) => e.created_at.startsWith(m)).length,
      }));

      // Top 10 schools by enrollment
      const { data: allEnrollments } = await supabaseAdmin
        .from("enrollments")
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

      const topSchoolsByEnrollment = Object.entries(schoolEnrollmentMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([schoolId, count]) => {
          const school = (allSchools ?? []).find((s) => s.id === schoolId);
          return { name: school?.name ?? schoolId, enrollment_count: count };
        });

      // Application stats
      const { data: appsData } = await supabaseAdmin
        .from("applications")
        .select("status");

      const applicationStats = {
        total: appsData?.length ?? 0,
        approved: (appsData ?? []).filter((a) => a.status === "approved").length,
        rejected: (appsData ?? []).filter((a) => a.status === "rejected").length,
        pending: (appsData ?? []).filter((a) => a.status === "pending").length,
      };

      res.json({
        schools_growth: schoolsGrowth,
        users_growth: usersGrowth,
        enrollments_by_month: enrollmentsByMonth,
        top_schools_by_enrollment: topSchoolsByEnrollment,
        application_stats: applicationStats,
        geographic_distribution: {},
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

      res.json({ data: enriched, total: count ?? 0, page: pageNum, limit: limitNum });
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

      res.json(data ?? []);
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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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
        supabaseAdmin
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("school_id", request.school_id),
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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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
          school_id: entry.school_id,
          school_name: schoolData?.name ?? null,
          deleted_at: entry.created_at,
          restore_deadline: entry.restore_deadline,
          days_remaining: daysRemaining,
          stats_snapshot: entry.stats_snapshot,
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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

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

      res.json(data ?? []);
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

export default router;
