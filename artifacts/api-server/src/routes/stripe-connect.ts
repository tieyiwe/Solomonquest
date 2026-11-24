import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  isStripeConfigured,
  createConnectAccount,
  createConnectOnboardingLink,
  createConnectLoginLink,
  getConnectAccountStatus,
} from "../lib/stripe";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function canManageConnect(req: AuthenticatedRequest, schoolId: string): boolean {
  if (req.userRole === "super_admin") return true;
  return req.userRole === "admin" && req.schoolId === schoolId;
}

// GET /schools/:id/stripe/status — current Connect status for a school.
// Re-checks live with Stripe (not just the cached DB status) so the admin
// always sees the true current state, and refreshes the cache while here.
router.get("/schools/:id/stripe/status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!canManageConnect(req, id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: school, error } = await supabaseAdmin
    .from("schools")
    .select("stripe_connect_account_id, stripe_connect_status, stripe_connect_details_submitted, stripe_connect_charges_enabled")
    .eq("id", id)
    .single();

  if (error || !school) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  if (!school.stripe_connect_account_id) {
    res.json({ status: "not_connected", detailsSubmitted: false, chargesEnabled: false });
    return;
  }

  if (!isStripeConfigured()) {
    res.json({
      status: school.stripe_connect_status,
      detailsSubmitted: school.stripe_connect_details_submitted,
      chargesEnabled: school.stripe_connect_charges_enabled,
    });
    return;
  }

  try {
    const live = await getConnectAccountStatus(school.stripe_connect_account_id as string);
    await supabaseAdmin
      .from("schools")
      .update({
        stripe_connect_status: live.status,
        stripe_connect_details_submitted: live.detailsSubmitted,
        stripe_connect_charges_enabled: live.chargesEnabled,
      })
      .eq("id", id);
    res.json(live);
  } catch (err) {
    logger.warn({ err }, "[stripe-connect] Failed to refresh live account status, returning cached");
    res.json({
      status: school.stripe_connect_status,
      detailsSubmitted: school.stripe_connect_details_submitted,
      chargesEnabled: school.stripe_connect_charges_enabled,
    });
  }
});

// POST /schools/:id/stripe/connect — start (or resume) onboarding. Creates
// the Connect account on first call; every call returns a fresh onboarding
// link since Stripe's account links expire quickly.
router.post("/schools/:id/stripe/connect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!canManageConnect(req, id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Stripe isn't connected on this platform yet. Contact the platform administrator." });
    return;
  }

  const { data: school, error } = await supabaseAdmin
    .from("schools")
    .select("id, name, stripe_connect_account_id")
    .eq("id", id)
    .single();

  if (error || !school) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  try {
    let accountId = school.stripe_connect_account_id as string | null;

    if (!accountId) {
      const { data: owner } = school ? await supabaseAdmin.from("profiles").select("email").eq("id", req.userId).maybeSingle() : { data: null };
      accountId = await createConnectAccount(school.name as string, owner?.email ?? null);
      await supabaseAdmin
        .from("schools")
        .update({ stripe_connect_account_id: accountId, stripe_connect_status: "pending" })
        .eq("id", id);
    }

    const appUrl = process.env.APP_URL ?? "";
    const returnUrl = `${appUrl}/dashboard/admin/tuition?stripe_connect=return`;
    const refreshUrl = `${appUrl}/dashboard/admin/tuition?stripe_connect=refresh`;
    const url = await createConnectOnboardingLink(accountId, refreshUrl, returnUrl);

    res.json({ url });
  } catch (err: any) {
    logger.error({ err }, "[stripe-connect] Failed to start onboarding");
    res.status(500).json({ error: err?.message ?? "Failed to start Stripe onboarding" });
  }
});

// POST /schools/:id/stripe/dashboard-link — a login link into the school's
// own Stripe dashboard (only works once onboarding is complete).
router.post("/schools/:id/stripe/dashboard-link", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!canManageConnect(req, id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Stripe isn't connected on this platform yet." });
    return;
  }

  const { data: school } = await supabaseAdmin
    .from("schools")
    .select("stripe_connect_account_id")
    .eq("id", id)
    .single();

  if (!school?.stripe_connect_account_id) {
    res.status(400).json({ error: "This school hasn't connected a Stripe account yet." });
    return;
  }

  try {
    const url = await createConnectLoginLink(school.stripe_connect_account_id as string);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create dashboard link" });
  }
});

export default router;
