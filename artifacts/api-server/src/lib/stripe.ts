import Stripe from "stripe";

let stripeClient: Stripe | null = null;
let warnedMissingKey = false;

/**
 * Lazily-initialized Stripe client. Deliberately does NOT throw at import
 * time when STRIPE_SECRET_KEY is unset — the server should boot and every
 * non-payment feature should keep working right up until someone actually
 * tries to start a checkout, at which point isStripeConfigured()/getStripe()
 * give a clear, specific error instead of a vague startup crash.
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Stripe isn't connected yet — set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET) to enable real payments."
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-08-26.dahlia",
    });
  }
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set — cannot verify Stripe webhook signatures.");
  }
  return secret;
}

/** Logs the missing-config situation once per process instead of on every request. */
export function warnStripeNotConfiguredOnce(): void {
  if (warnedMissingKey) return;
  warnedMissingKey = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[stripe] STRIPE_SECRET_KEY is not set — tuition checkout will use the simulate-pay fallback until it's connected."
  );
}

// ─── Stripe Connect ─────────────────────────────────────────────────────────
// Each school gets its own "standard" Connect account — a real, independent
// Stripe account the school controls directly (its own dashboard, its own
// payouts, its own tax/compliance surface). The platform's STRIPE_SECRET_KEY
// is only ever used to create the account and generate onboarding links;
// once onboarded, checkout sessions run against the school's account id via
// the `stripeAccount` request option, so funds go straight to the school and
// never pass through (or get held by) the platform's own Stripe balance.

/** Creates a new standard Connect account for a school. Call once; the
 *  resulting id is stored on schools.stripe_connect_account_id. */
export async function createConnectAccount(schoolName: string, schoolEmail?: string | null): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "standard",
    email: schoolEmail ?? undefined,
    business_profile: { name: schoolName },
  });
  return account.id;
}

/** A one-time-use hosted onboarding link for a school's admin to complete
 *  (or resume/fix) their Stripe account setup. Links expire quickly, so
 *  this is generated fresh on demand, never cached. */
export async function createConnectOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/** A link to the school's own Stripe Express dashboard for a standard
 *  account — standard accounts get the full Stripe dashboard directly, so
 *  this is just a login link, not a platform-hosted view. */
export async function createConnectLoginLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

export interface ConnectAccountStatus {
  status: "not_connected" | "pending" | "connected" | "restricted";
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
}

export async function getConnectAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  const detailsSubmitted = account.details_submitted === true;
  const chargesEnabled = account.charges_enabled === true;
  const hasRequirements = (account.requirements?.currently_due?.length ?? 0) > 0;

  let status: ConnectAccountStatus["status"] = "pending";
  if (chargesEnabled && detailsSubmitted) status = "connected";
  else if (detailsSubmitted && hasRequirements) status = "restricted";

  return { status, detailsSubmitted, chargesEnabled };
}
