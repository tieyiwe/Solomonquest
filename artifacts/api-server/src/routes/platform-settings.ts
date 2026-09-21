import { Router, type IRouter, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { isSmtpConfigured, sendTestEmail } from "../lib/email";
import { isStripeConfigured } from "../lib/stripe";
import type { FeatureKey } from "../lib/featureFlags";

const router: IRouter = Router();

const requireSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.userRole !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
};

async function auditLog(params: {
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await supabaseAdmin.from("platform_audit_log").insert({
    actor_id: params.actorId ?? null,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    target_name: params.targetName ?? null,
    details: params.details ?? null,
  });
}

const ALL_FEATURE_KEYS: FeatureKey[] = ["chat", "video_calls", "forum", "ai_agent", "custom_domain", "notes", "tuition"];

const DEFAULTS = {
  sessionTimeoutMinutes: 0, // 0 = no forced timeout
  passwordMinLength: 8,
  requireEmailVerification: true,
  maxUploadSizeMb: 25,
  aiMessagesPer10Min: 15,
  defaultEnabledFeatures: ALL_FEATURE_KEYS.reduce((acc, k) => ({ ...acc, [k]: true }), {} as Record<string, boolean>),
  supportEmail: "",
  platformName: "SolomonQuest",
};

type AdvancedSettingsKey = keyof typeof DEFAULTS;
const KEYS = Object.keys(DEFAULTS) as AdvancedSettingsKey[];

// ─── GET /super-admin/advanced-settings ─────────────────────────────────────
// A second, purpose-built layer on top of the existing generic
// platform_settings key/value table (same table platform-settings' max
// schools/maintenance-mode toggles already use) so no new migration is
// needed — this just adds a fuller set of well-known keys with sane
// defaults, plus read-only status of integrations (SMTP/Stripe) so a
// super admin can see what's actually configured without checking env
// vars on the server.
router.get(
  "/super-admin/advanced-settings",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { data, error } = await supabaseAdmin.from("platform_settings").select("key, value").in("key", KEYS);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
    const values: Record<string, unknown> = {};
    for (const key of KEYS) {
      values[key] = byKey.has(key) ? byKey.get(key) : DEFAULTS[key];
    }

    res.json({
      ...values,
      integrations: {
        smtpConfigured: isSmtpConfigured(),
        stripeConfigured: isStripeConfigured(),
      },
    });
  }
);

// ─── PUT /super-admin/advanced-settings ─────────────────────────────────────
router.put(
  "/super-admin/advanced-settings",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { key, value } = req.body as { key?: string; value?: unknown };

    if (!key || !KEYS.includes(key as AdvancedSettingsKey)) {
      res.status(400).json({ error: `key must be one of: ${KEYS.join(", ")}` });
      return;
    }

    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key, value, updated_by: req.userId, updated_at: new Date().toISOString() });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    await auditLog({
      actorId: req.userId,
      action: "advanced_setting_updated",
      targetType: "platform",
      targetId: key,
      targetName: key,
      details: { value },
    });

    res.json({ key, value });
  }
);

// ─── POST /super-admin/advanced-settings/test-email ─────────────────────────
router.post(
  "/super-admin/advanced-settings/test-email",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { to } = req.body as { to?: string };
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ error: "A valid 'to' email address is required" });
      return;
    }
    try {
      await sendTestEmail(to);
      res.json({ sent: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to send test email" });
    }
  }
);

export default router;
