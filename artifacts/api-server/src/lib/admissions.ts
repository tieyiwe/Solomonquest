/**
 * Pure admissions logic: application-fee resolution, the approval gate, the
 * checks an application-fee Stripe event must pass, and validation of the
 * school's "admission details" (the text of the congratulations email).
 *
 * Nothing in here touches the database or the network, so every rule can be
 * unit-tested on its own. The routes (routes/applications.ts,
 * routes/admissions.ts) and the webhook (routes/stripe-webhook.ts) load the
 * rows and call these.
 */

/** Two-decimal currencies only: amounts are stored in cents everywhere. */
export const SUPPORTED_CURRENCIES = [
  "usd", "eur", "gbp", "cad", "aud", "nzd", "zar", "ngn", "kes", "ghs", "inr", "sgd",
] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(c: unknown): c is SupportedCurrency {
  return typeof c === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(c.toLowerCase());
}

/** Stripe's minimum charge is about 0.50 in most currencies. */
export const MIN_APPLICATION_FEE_CENTS = 50;
export const MAX_APPLICATION_FEE_CENTS = 100_000_00;

export type FeeStatus = "not_required" | "awaiting_payment" | "paid" | "waived";

// ─── Fee resolution ──────────────────────────────────────────────────────────

export interface SchoolFeeConfig {
  enabled: boolean;
  amountCents: number;
  currency: string;
}

export interface ResolvedFee {
  required: boolean;
  amountCents: number;
  currency: string;
}

/**
 * What an applicant owes to apply. Free unless the school turned the fee on.
 * A program override replaces the school amount (0 makes that program free);
 * null/undefined means "use the school default".
 */
export function resolveApplicationFee(
  school: SchoolFeeConfig | null | undefined,
  programOverrideCents?: number | null
): ResolvedFee {
  const currency = (school?.currency || "usd").toLowerCase();
  if (!school || !school.enabled) return { required: false, amountCents: 0, currency };
  const amount =
    programOverrideCents !== null && programOverrideCents !== undefined && Number.isFinite(programOverrideCents)
      ? Math.round(programOverrideCents)
      : Math.round(school.amountCents || 0);
  if (amount <= 0) return { required: false, amountCents: 0, currency };
  return { required: true, amountCents: amount, currency };
}

/** Validates an admin's fee settings. Returns an error message or null. */
export function validateFeeSettings(input: { enabled?: unknown; amountCents?: unknown; currency?: unknown }): string | null {
  if (typeof input.enabled !== "boolean") return "enabled must be true or false";
  if (!isSupportedCurrency(input.currency)) return `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ").toUpperCase()}`;
  if (!input.enabled) return null;
  const amount = input.amountCents;
  if (typeof amount !== "number" || !Number.isInteger(amount)) return "Enter the fee amount";
  if (amount < MIN_APPLICATION_FEE_CENTS) return "The application fee must be at least 0.50";
  if (amount > MAX_APPLICATION_FEE_CENTS) return "That application fee is too large";
  return null;
}

/** Validates a per-program override (null = use the school default). */
export function validateProgramFeeOverride(amount: unknown): string | null {
  if (amount === null || amount === undefined) return null;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return "Program fee must be a whole number of cents, 0 or more";
  if (amount > 0 && amount < MIN_APPLICATION_FEE_CENTS) return "A program fee must be 0 (free) or at least 0.50";
  if (amount > MAX_APPLICATION_FEE_CENTS) return "That application fee is too large";
  return null;
}

export interface StripeReadiness {
  platformConfigured: boolean;
  accountId: string | null | undefined;
  chargesEnabled: boolean | null | undefined;
}

/** A school can only charge an application fee through its own connected Stripe account. */
export function stripeReadyForFees(s: StripeReadiness): boolean {
  return !!s.platformConfigured && !!s.accountId && !!s.chargesEnabled;
}

// ─── Approval gate ───────────────────────────────────────────────────────────

export function canApproveApplication(app: { fee_status?: string | null }): { ok: true } | { ok: false; reason: string } {
  if (app.fee_status === "awaiting_payment") {
    return {
      ok: false,
      reason: "The application fee hasn't been paid. Wait for payment, or waive the fee to approve.",
    };
  }
  return { ok: true };
}

// ─── Application-fee webhook checks ─────────────────────────────────────────

export interface FeeSessionLike {
  id: string;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
}

export interface FeeApplicationRow {
  id: string;
  school_id: string;
  fee_status?: string | null;
  fee_amount_cents?: number | null;
  fee_currency?: string | null;
}

export type FeeWebhookDecision =
  | { action: "mark_paid"; applicationId: string }
  | { action: "ignore"; reason: string };

/**
 * Decides whether a completed Checkout Session may mark an application fee
 * paid. Metadata can be set by anyone with a connected account, so every
 * claim in it is checked against our own rows:
 *   - the application exists and belongs to the school named in metadata;
 *   - the event came from THAT school's connected account;
 *   - Stripe says the session is paid;
 *   - the amount and currency equal what we stored when they applied;
 *   - it isn't already paid or waived (replays are no-ops).
 */
export function evaluateApplicationFeeSession(input: {
  eventAccount: string | null | undefined;
  session: FeeSessionLike;
  application: FeeApplicationRow | null | undefined;
  schoolAccountId: string | null | undefined;
}): FeeWebhookDecision {
  const { eventAccount, session, application, schoolAccountId } = input;
  const meta = session.metadata ?? {};
  if (meta.type !== "application_fee") return { action: "ignore", reason: "not an application fee session" };
  if (!meta.applicationId || !meta.schoolId) return { action: "ignore", reason: "missing metadata" };
  if (!application || application.id !== meta.applicationId) return { action: "ignore", reason: "unknown application" };
  if (application.school_id !== meta.schoolId) return { action: "ignore", reason: "school mismatch" };
  if (!schoolAccountId || eventAccount !== schoolAccountId) return { action: "ignore", reason: "account mismatch" };
  if (session.payment_status !== "paid") return { action: "ignore", reason: "not paid" };
  if (application.fee_status === "paid") return { action: "ignore", reason: "replay: already paid" };
  if (application.fee_status !== "awaiting_payment") return { action: "ignore", reason: `fee status is ${application.fee_status ?? "none"}` };
  if (
    typeof application.fee_amount_cents !== "number" ||
    session.amount_total !== application.fee_amount_cents
  ) {
    return { action: "ignore", reason: "amount mismatch" };
  }
  if ((session.currency ?? "").toLowerCase() !== (application.fee_currency ?? "").toLowerCase()) {
    return { action: "ignore", reason: "currency mismatch" };
  }
  return { action: "mark_paid", applicationId: application.id };
}

// ─── Admission details (the congratulations email) ──────────────────────────

export interface NextStep {
  title: string;
  description: string;
  url: string | null;
}

export interface ExtraLink {
  label: string;
  url: string;
}

export interface AdmissionDetails {
  headline: string;
  message: string;
  nextSteps: NextStep[];
  requiredDocuments: string[];
  /** YYYY-MM-DD */
  startDate: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  extraLinks: ExtraLink[];
}

export const LIMITS = {
  headline: 150,
  message: 3000,
  steps: 10,
  stepTitle: 120,
  stepDescription: 600,
  url: 500,
  documents: 20,
  document: 200,
  links: 10,
  linkLabel: 100,
  contactName: 120,
  contactEmail: 200,
  contactPhone: 50,
} as const;

export const PLACEHOLDERS = ["{studentName}", "{programName}", "{schoolName}", "{startDate}"] as const;

export const DEFAULT_ADMISSION_DETAILS: AdmissionDetails = {
  headline: "Congratulations, {studentName}!",
  message:
    "We are delighted to let you know that your application to {schoolName} has been approved. " +
    "Welcome to {programName}! We can't wait to see you grow with us.",
  nextSteps: [
    {
      title: "Sign in to your student dashboard",
      description: "Your courses are ready. Sign in to see your timetable, materials and announcements.",
      url: null,
    },
    {
      title: "Complete your profile",
      description: "Add a profile photo and check your contact details so your teachers can reach you.",
      url: null,
    },
  ],
  requiredDocuments: [],
  startDate: null,
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  extraLinks: [],
};

/** Only absolute http(s) links, trimmed and length-limited. Anything else is dropped. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > LIMITS.url) return null;
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function str(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Strip control characters (except newlines/tabs) so nothing odd lands in a header or body.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

const EMAIL_RX = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeSteps(value: unknown, errors: string[]): NextStep[] {
  if (!Array.isArray(value)) return [];
  if (value.length > LIMITS.steps) errors.push(`At most ${LIMITS.steps} next steps`);
  const out: NextStep[] = [];
  for (const raw of value.slice(0, LIMITS.steps)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const title = str(r.title, LIMITS.stepTitle);
    const description = str(r.description, LIMITS.stepDescription);
    const rawUrl = typeof r.url === "string" ? r.url.trim() : "";
    const url = rawUrl ? safeHttpUrl(rawUrl) : null;
    if (rawUrl && !url) errors.push(`Next step "${title || "untitled"}" has a link that isn't an http(s) web address`);
    if (!title && !description) continue;
    out.push({ title: title || "Next step", description, url });
  }
  return out;
}

/**
 * Cleans what an admin typed: trims, length-limits, drops non-http(s) links
 * and reports anything it had to reject. Text stays plain text — it is
 * HTML-escaped when the email is rendered, never trusted as markup.
 */
export function sanitizeAdmissionDetails(input: unknown): { details: AdmissionDetails; errors: string[] } {
  const r = (input ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const headline = str(r.headline, LIMITS.headline);
  const message = str(r.message, LIMITS.message);
  const nextSteps = sanitizeSteps(r.nextSteps, errors);

  const requiredDocuments = Array.isArray(r.requiredDocuments)
    ? r.requiredDocuments.slice(0, LIMITS.documents).map((d) => str(d, LIMITS.document)).filter(Boolean)
    : [];

  let startDate: string | null = null;
  if (typeof r.startDate === "string" && r.startDate.trim()) {
    const d = r.startDate.trim().slice(0, 10);
    if (DATE_RX.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))) startDate = d;
    else errors.push("Start date must be a valid date");
  }

  const contactName = str(r.contactName, LIMITS.contactName);
  let contactEmail = str(r.contactEmail, LIMITS.contactEmail);
  if (contactEmail && !EMAIL_RX.test(contactEmail)) {
    errors.push("Contact email doesn't look like an email address");
    contactEmail = "";
  }
  const contactPhone = str(r.contactPhone, LIMITS.contactPhone).replace(/[^\d+()\-.\s x]/gi, "");

  const extraLinks: ExtraLink[] = [];
  if (Array.isArray(r.extraLinks)) {
    for (const raw of r.extraLinks.slice(0, LIMITS.links)) {
      const l = (raw ?? {}) as Record<string, unknown>;
      const label = str(l.label, LIMITS.linkLabel);
      const rawUrl = typeof l.url === "string" ? l.url.trim() : "";
      if (!label && !rawUrl) continue;
      const url = safeHttpUrl(rawUrl);
      if (!url) {
        errors.push(`Link "${label || rawUrl}" isn't an http(s) web address`);
        continue;
      }
      extraLinks.push({ label: label || url, url });
    }
  }

  return {
    details: {
      headline: headline || DEFAULT_ADMISSION_DETAILS.headline,
      message: message || DEFAULT_ADMISSION_DETAILS.message,
      nextSteps,
      requiredDocuments,
      startDate,
      contactName,
      contactEmail,
      contactPhone,
      extraLinks,
    },
    errors,
  };
}

/** DB row (school_admission_settings) -> details, falling back to defaults field by field. */
export function detailsFromRow(row: Record<string, unknown> | null | undefined): AdmissionDetails {
  if (!row) return { ...DEFAULT_ADMISSION_DETAILS, nextSteps: [...DEFAULT_ADMISSION_DETAILS.nextSteps] };
  const steps = Array.isArray(row.next_steps) ? (row.next_steps as unknown[]) : null;
  const { details } = sanitizeAdmissionDetails({
    headline: row.congrats_headline,
    message: row.congrats_message,
    nextSteps: steps ?? [],
    requiredDocuments: row.required_documents,
    startDate: row.start_date,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    extraLinks: row.extra_links,
  });
  // A school that saved its fee settings but never touched the email still
  // gets the default next steps rather than an empty list.
  if (!steps || (steps.length === 0 && row.congrats_message == null && row.congrats_headline == null)) {
    details.nextSteps = [...DEFAULT_ADMISSION_DETAILS.nextSteps];
  }
  return details;
}

export function detailsToRow(d: AdmissionDetails): Record<string, unknown> {
  return {
    congrats_headline: d.headline,
    congrats_message: d.message,
    next_steps: d.nextSteps,
    required_documents: d.requiredDocuments,
    start_date: d.startDate,
    contact_name: d.contactName || null,
    contact_email: d.contactEmail || null,
    contact_phone: d.contactPhone || null,
    extra_links: d.extraLinks,
  };
}

export interface ProgramOverride {
  congratsMessage?: string | null;
  nextSteps?: NextStep[] | null;
}

/** Program overrides replace the message and/or next steps; everything else comes from the school. */
export function applyProgramOverride(details: AdmissionDetails, override: ProgramOverride | null | undefined): AdmissionDetails {
  if (!override) return details;
  return {
    ...details,
    message: override.congratsMessage && override.congratsMessage.trim() ? str(override.congratsMessage, LIMITS.message) : details.message,
    nextSteps: Array.isArray(override.nextSteps) && override.nextSteps.length > 0 ? sanitizeSteps(override.nextSteps, []) : details.nextSteps,
  };
}

export interface PlaceholderValues {
  studentName: string;
  programName: string;
  schoolName: string;
  startDate: string;
}

/** Replaces {studentName} etc. in plain text. Escaping happens afterwards, in the renderer. */
export function fillPlaceholders(text: string, v: PlaceholderValues): string {
  return text
    .replace(/\{studentName\}/g, v.studentName)
    .replace(/\{programName\}/g, v.programName)
    .replace(/\{schoolName\}/g, v.schoolName)
    .replace(/\{startDate\}/g, v.startDate);
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${(currency || "").toUpperCase()}`;
  }
}

/** "Monday, 11 January 2027" for a YYYY-MM-DD date, read as a calendar date (no time zone shift). */
export function formatStartDate(date: string | null | undefined): string {
  if (!date || !DATE_RX.test(date)) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
