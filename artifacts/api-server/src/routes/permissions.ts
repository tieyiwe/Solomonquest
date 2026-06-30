import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

type Role = "teacher" | "student" | "staff";
type Feature = "chat" | "forum" | "video" | "resources" | "quizzes" | "assignments" | "announcements" | "applications";

const ALL_FEATURES: Feature[] = [
  "chat",
  "forum",
  "video",
  "resources",
  "quizzes",
  "assignments",
  "announcements",
  "applications",
];

const ALL_ROLES: Role[] = ["teacher", "student", "staff"];

const DEFAULT_PERMISSIONS: Record<Role, Feature[]> = {
  teacher: ["chat", "forum", "video", "resources", "quizzes", "assignments", "announcements"],
  student: ["chat", "forum", "video", "resources", "quizzes", "assignments"],
  staff: ["chat", "forum", "resources", "announcements"],
};

interface RolePermissionRow {
  role: Role;
  feature: Feature;
  is_enabled: boolean;
}

type PermissionsMap = Record<Role, Record<Feature, boolean>>;

function buildDefaultPermissions(): PermissionsMap {
  const result = {} as PermissionsMap;
  for (const role of ALL_ROLES) {
    result[role] = {} as Record<Feature, boolean>;
    for (const feature of ALL_FEATURES) {
      result[role][feature] = DEFAULT_PERMISSIONS[role].includes(feature);
    }
  }
  return result;
}

function mergeWithDefaults(rows: RolePermissionRow[]): PermissionsMap {
  const permissions = buildDefaultPermissions();
  for (const row of rows) {
    if (ALL_ROLES.includes(row.role) && ALL_FEATURES.includes(row.feature)) {
      permissions[row.role][row.feature] = row.is_enabled;
    }
  }
  return permissions;
}

// GET /permissions — get school's full permission settings (admin only)
router.get("/permissions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const schoolId = req.schoolId ?? "";

  const { data, error } = await supabaseAdmin
    .from("role_permissions")
    .select("role, feature, is_enabled")
    .eq("school_id", schoolId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const permissions = mergeWithDefaults((data ?? []) as RolePermissionRow[]);
  res.json(permissions);
});

// PATCH /permissions — update a single role+feature toggle (admin only)
router.patch("/permissions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { role, feature, isEnabled } = req.body as {
    role: Role;
    feature: Feature;
    isEnabled: boolean;
  };

  if (!role || !feature || typeof isEnabled !== "boolean") {
    res.status(400).json({ error: "role, feature, and isEnabled are required" });
    return;
  }

  if (!ALL_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${ALL_ROLES.join(", ")}` });
    return;
  }

  if (!ALL_FEATURES.includes(feature)) {
    res.status(400).json({ error: `Invalid feature. Must be one of: ${ALL_FEATURES.join(", ")}` });
    return;
  }

  const schoolId = req.schoolId ?? "";

  const { error: upsertError } = await supabaseAdmin
    .from("role_permissions")
    .upsert(
      {
        school_id: schoolId,
        role,
        feature,
        is_enabled: isEnabled,
      },
      { onConflict: "school_id,role,feature" }
    );

  if (upsertError) {
    res.status(500).json({ error: upsertError.message });
    return;
  }

  // Return full updated permissions map
  const { data, error: fetchError } = await supabaseAdmin
    .from("role_permissions")
    .select("role, feature, is_enabled")
    .eq("school_id", schoolId);

  if (fetchError) {
    res.status(500).json({ error: fetchError.message });
    return;
  }

  const permissions = mergeWithDefaults((data ?? []) as RolePermissionRow[]);
  res.json(permissions);
});

// GET /permissions/my — get current user's feature permissions for their role
router.get("/permissions/my", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole as Role | undefined;
  const schoolId = req.schoolId ?? "";

  if (!role || !ALL_ROLES.includes(role)) {
    // Non-standard roles (e.g. admin) get all features
    const allEnabled: Record<Feature, boolean> = {} as Record<Feature, boolean>;
    for (const feature of ALL_FEATURES) {
      allEnabled[feature] = true;
    }
    res.json(allEnabled);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("role_permissions")
    .select("feature, is_enabled")
    .eq("school_id", schoolId)
    .eq("role", role);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Start from defaults for this role
  const featureMap: Record<Feature, boolean> = {} as Record<Feature, boolean>;
  for (const feature of ALL_FEATURES) {
    featureMap[feature] = DEFAULT_PERMISSIONS[role].includes(feature);
  }

  // Override with stored rows
  for (const row of (data ?? []) as Array<{ feature: Feature; is_enabled: boolean }>) {
    if (ALL_FEATURES.includes(row.feature)) {
      featureMap[row.feature] = row.is_enabled;
    }
  }

  res.json(featureMap);
});

export default router;
