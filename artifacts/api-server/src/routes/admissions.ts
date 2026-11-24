import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { logger } from "../lib/logger";
import { sendEmailOrThrow } from "../lib/email";
import { renderAdmissionEmail } from "../lib/admissionEmail";
import {
  DEFAULT_ADMISSION_DETAILS,
  LIMITS,
  PLACEHOLDERS,
  SUPPORTED_CURRENCIES,
  MIN_APPLICATION_FEE_CENTS,
  applyProgramOverride,
  detailsFromRow,
  detailsToRow,
  evaluateApplicationFeeSession,
  resolveApplicationFee,
  sanitizeAdmissionDetails,
  stripeReadyForFees,
  validateFeeSettings,
  validateProgramFeeOverride,
  type NextStep,
} from "../lib/admissions";
import {
  APP_URL,
  feeConfigFromRow,
  loadSchoolAdmissionSettings,
  sendCongratulationsEmail,
} from "../lib/admissionApproval";

/**
 * Admissions settings and the application-fee flow.
 *
 *   GET  /schools/:id/admissions/public        public: programs + prices + fee, for the school page / apply form
 *   GET  /admissions/settings                  admin: fee, Stripe readiness, admission details, program overrides
 *   PUT  /admissions/settings/fee              admin: turn the application fee on/off (needs Stripe)
 *   PUT  /admissions/settings/details          admin: congratulations email content
 *   PUT  /admissions/programs/:programId       admin: per-program fee / message / next steps
 *   POST /admissions/settings/preview          admin: render the email (unsaved edits allowed)
 *   POST /admissions/settings/test-email       admin: send that rendering to yourself
 *   GET  /applications/:id/summary             applicant or school admin: status page data
 *   POST /applications/:id/fee-checkout        applicant: Stripe Checkout for the fee
 *   POST /applications/:id/fee-checkout/confirm applicant: re-check the session after returning from Stripe
 *   POST /applications/:id/waive-fee           admin: waive an unpaid fee
 *   POST /applications/:id/resend-congratulations admin: resend the approval email
 */

const router: IRouter = Router();

function isAdmin(req: AuthenticatedRequest): boolean {
  return req.userRole === "admin" || req.userRole === "super_admin";
}

function requireSchoolAdmin(req: AuthenticatedRequest, res: Response): string | null {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  if (!req.schoolId) {
    res.status(400).json({ error: "You are not associated with a school" });
    return null;
  }
  return req.schoolId;
}

function paramId(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function mapPrice(plan: Record<string, unknown> | null | undefined) {
  if (!plan) return null;
  return {
    amountCents: plan.amount_cents as number,
    currency: ((plan.currency as string) || "usd").toLowerCase(),
    allowFullPayment: plan.allow_full_payment as boolean,
    allowInstallments: plan.allow_installments as boolean,
    installmentCount: plan.installment_count as number,
    pricingNote: (plan.pricing_note as string | null) ?? null,
  };
}

async function loadStripeReadiness(schoolId: string) {
  const { data: school } = await supabaseAdmin
    .from("schools")
    .select("stripe_connect_account_id, stripe_connect_status, stripe_connect_charges_enabled")
    .eq("id", schoolId)
    .maybeSingle();
  const readiness = {
    platformConfigured: isStripeConfigured(),
    accountId: (school?.stripe_connect_account_id as string | null) ?? null,
    chargesEnabled: (school?.stripe_connect_charges_enabled as boolean | null) ?? false,
  };
  return {
    readiness,
    view: {
      platformConfigured: readiness.platformConfigured,
      connected: !!readiness.accountId,
      chargesEnabled: !!readiness.chargesEnabled,
      status: (school?.stripe_connect_status as string | null) ?? "not_connected",
      ready: stripeReadyForFees(readiness),
    },
  };
}

// ─── Public: programs, prices and the application fee ───────────────────────
router.get("/schools/:id/admissions/public", async (req, res): Promise<void> => {
  const schoolId = paramId(req.params.id);
  const { data: school } = await supabaseAdmin
    .from("schools")
    .select("id")
    .eq("id", schoolId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!school) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  const [{ data: programs }, { data: plans }, settings, { data: overrides }] = await Promise.all([
    supabaseAdmin.from("programs").select("id, name, code, description, level, is_active").eq("school_id", schoolId).order("name"),
    supabaseAdmin.from("tuition_plans").select("*").eq("school_id", schoolId).not("program_id", "is", null),
    loadSchoolAdmissionSettings(schoolId),
    supabaseAdmin.from("program_admission_settings").select("program_id, application_fee_cents").eq("school_id", schoolId),
  ]);

  const planByProgram = new Map((plans ?? []).map((p) => [p.program_id as string, p as Record<string, unknown>]));
  const overrideByProgram = new Map((overrides ?? []).map((o) => [o.program_id as string, o.application_fee_cents as number | null]));
  const feeConfig = feeConfigFromRow(settings);
  const schoolFee = resolveApplicationFee(feeConfig, null);

  res.json({
    applicationFee: { required: schoolFee.required, amountCents: schoolFee.amountCents, currency: schoolFee.currency },
    programs: (programs ?? [])
      .filter((p) => p.is_active !== false)
      .map((p) => {
        const fee = resolveApplicationFee(feeConfig, overrideByProgram.get(p.id as string) ?? null);
        return {
          id: p.id,
          name: p.name,
          code: p.code ?? null,
          description: p.description ?? null,
          level: p.level ?? null,
          price: mapPrice(planByProgram.get(p.id as string)),
          applicationFee: { required: fee.required, amountCents: fee.amountCents, currency: fee.currency },
        };
      }),
  });
});

// ─── Admin: read everything for the settings page ───────────────────────────
router.get("/admissions/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireSchoolAdmin(req, res);
  if (!schoolId) return;

  const [settings, stripe, { data: programs }, { data: overrides }, { data: plans }] = await Promise.all([
    loadSchoolAdmissionSettings(schoolId),
    loadStripeReadiness(schoolId),
    supabaseAdmin.from("programs").select("id, name, is_active").eq("school_id", schoolId).order("name"),
    supabaseAdmin.from("program_admission_settings").select("*").eq("school_id", schoolId),
    supabaseAdmin.from("tuition_plans").select("*").eq("school_id", schoolId).not("program_id", "is", null),
  ]);

  const overrideByProgram = new Map((overrides ?? []).map((o) => [o.program_id as string, o as Record<string, unknown>]));
  const planByProgram = new Map((plans ?? []).map((p) => [p.program_id as string, p as Record<string, unknown>]));
  const fee = feeConfigFromRow(settings);

  res.json({
    fee: { enabled: fee?.enabled ?? false, amountCents: fee?.amountCents ?? 0, currency: fee?.currency ?? "usd" },
    stripe: stripe.view,
    details: detailsFromRow(settings),
    isDefaultDetails: !settings || (settings.congrats_message == null && settings.congrats_headline == null),
    defaults: DEFAULT_ADMISSION_DETAILS,
    placeholders: PLACEHOLDERS,
    limits: LIMITS,
    currencies: SUPPORTED_CURRENCIES,
    minFeeCents: MIN_APPLICATION_FEE_CENTS,
    programs: (programs ?? []).map((p) => {
      const o = overrideByProgram.get(p.id as string);
      return {
        id: p.id,
        name: p.name,
        isActive: p.is_active !== false,
        price: mapPrice(planByProgram.get(p.id as string)),
        override: o
          ? {
              applicationFeeCents: (o.application_fee_cents as number | null) ?? null,
              congratsMessage: (o.congrats_message as string | null) ?? null,
              nextSteps: Array.isArray(o.next_steps) ? (o.next_steps as NextStep[]) : null,
            }
          : null,
      };
    }),
  });
});

async function upsertSettings(schoolId: string, userId: string | undefined, patch: Record<string, unknown>) {
  return supabaseAdmin
    .from("school_admission_settings")
    .upsert({ school_id: schoolId, ...patch, updated_by: userId ?? null, updated_at: new Date().toISOString() }, { onConflict: "school_id" })
    .select()
    .single();
}

// ─── Admin: application fee on/off ──────────────────────────────────────────
router.put("/admissions/settings/fee", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireSchoolAdmin(req, res);
  if (!schoolId) return;

  const body = req.body as { enabled?: unknown; amountCents?: unknown; currency?: unknown };
  const currency = typeof body.currency === "string" ? body.currency.toLowerCase() : body.currency;
  const err = validateFeeSettings({ ...body, currency });
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  if (body.enabled === true) {
    const { readiness, view } = await loadStripeReadiness(schoolId);
    if (!stripeReadyForFees(readiness)) {
      res.status(409).json({
        code: "stripe_not_ready",
        stripe: view,
        error: !readiness.platformConfigured
          ? "Online payments aren't available on this platform yet, so a paid application fee can't be turned on."
          : "Connect your school's Stripe account (and finish Stripe's setup so it can take card payments) before charging an application fee.",
      });
      return;
    }
  }

  const { data, error } = await upsertSettings(schoolId, req.userId, {
    application_fee_enabled: body.enabled === true,
    application_fee_cents: body.enabled === true ? (body.amountCents as number) : Number(body.amountCents) || 0,
    application_fee_currency: currency as string,
  });
  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to save the application fee" });
    return;
  }
  const fee = feeConfigFromRow(data as Record<string, unknown>)!;
  res.json({ fee });
});

// ─── Admin: admission details (email content) ───────────────────────────────
router.put("/admissions/settings/details", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireSchoolAdmin(req, res);
  if (!schoolId) return;

  const { details, errors } = sanitizeAdmissionDetails(req.body);
  if (errors.length) {
    res.status(400).json({ error: errors[0], errors });
    return;
  }
  const { data, error } = await upsertSettings(schoolId, req.userId, detailsToRow(details));
  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to save admission details" });
    return;
  }
  res.json({ details: detailsFromRow(data as Record<string, unknown>) });
});

// ─── Admin: per-program overrides ───────────────────────────────────────────
router.put("/admissions/programs/:programId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireSchoolAdmin(req, res);
  if (!schoolId) return;
  const programId = paramId(req.params.programId);

  const { data: program } = await supabaseAdmin.from("programs").select("id").eq("id", programId).eq("school_id", schoolId).maybeSingle();
  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  const body = req.body as { applicationFeeCents?: unknown; congratsMessage?: unknown; nextSteps?: unknown };
  const feeErr = validateProgramFeeOverride(body.applicationFeeCents);
  if (feeErr) {
    res.status(400).json({ error: feeErr });
    return;
  }
  const message = typeof body.congratsMessage === "string" ? body.congratsMessage.trim().slice(0, LIMITS.message) : "";
  let nextSteps: NextStep[] | null = null;
  if (Array.isArray(body.nextSteps) && body.nextSteps.length > 0) {
    const { details, errors } = sanitizeAdmissionDetails({ nextSteps: body.nextSteps });
    if (errors.length) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }
    nextSteps = details.nextSteps;
  }
  const applicationFeeCents = (body.applicationFeeCents as number | null | undefined) ?? null;

  if (applicationFeeCents === null && !message && !nextSteps) {
    await supabaseAdmin.from("program_admission_settings").delete().eq("program_id", programId).eq("school_id", schoolId);
    res.json({ override: null });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("program_admission_settings")
    .upsert(
      {
        program_id: programId,
        school_id: schoolId,
        application_fee_cents: applicationFeeCents,
        congrats_message: message || null,
        next_steps: nextSteps,
        updated_by: req.userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "program_id" }
    )
    .select()
    .single();
  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to save program settings" });
    return;
  }
  res.json({
    override: {
      applicationFeeCents: data.application_fee_cents ?? null,
      congratsMessage: data.congrats_message ?? null,
      nextSteps: data.next_steps ?? null,
    },
  });
});

// ─── Admin: preview + test email ────────────────────────────────────────────
async function renderForAdmin(req: AuthenticatedRequest, schoolId: string) {
  const body = (req.body ?? {}) as { details?: unknown; programId?: string | null; programOverride?: { congratsMessage?: string | null; nextSteps?: NextStep[] | null } };
  const settings = await loadSchoolAdmissionSettings(schoolId);
  const base = body.details ? sanitizeAdmissionDetails(body.details).details : detailsFromRow(settings);

  const [{ data: school }, { data: me }] = await Promise.all([
    supabaseAdmin.from("schools").select("name, logo_url").eq("id", schoolId).maybeSingle(),
    supabaseAdmin.from("profiles").select("email, first_name, last_name").eq("id", req.userId ?? "").maybeSingle(),
  ]);

  let programName: string | null = "Sample Programme";
  let tuition: Parameters<typeof renderAdmissionEmail>[0]["tuition"] = null;
  let details = base;
  if (body.programId) {
    const [{ data: program }, { data: plan }, { data: override }] = await Promise.all([
      supabaseAdmin.from("programs").select("name").eq("id", body.programId).eq("school_id", schoolId).maybeSingle(),
      supabaseAdmin.from("tuition_plans").select("*").eq("program_id", body.programId).eq("school_id", schoolId).maybeSingle(),
      supabaseAdmin.from("program_admission_settings").select("*").eq("program_id", body.programId).eq("school_id", schoolId).maybeSingle(),
    ]);
    if (program) {
      programName = program.name as string;
      const o = body.programOverride ?? (override ? { congratsMessage: override.congrats_message, nextSteps: override.next_steps } : null);
      details = applyProgramOverride(base, o as never);
      if (plan && (plan.amount_cents as number) > 0) {
        tuition = {
          amountCents: plan.amount_cents as number,
          currency: (plan.currency as string) || "usd",
          installmentCount: plan.allow_full_payment || !plan.allow_installments ? 1 : (plan.installment_count as number),
          pricingNote: (plan.pricing_note as string | null) ?? null,
          url: `${APP_URL}/dashboard/student/tuition`,
        };
      }
    }
  }

  const rendered = renderAdmissionEmail({
    details,
    studentName: me ? [me.first_name, me.last_name].filter(Boolean).join(" ") || "Amara Okafor" : "Amara Okafor",
    programName,
    school: { name: (school?.name as string) ?? "Your school", logoUrl: (school?.logo_url as string | null) ?? null },
    tuition,
    account: { url: `${APP_URL}/auth/login`, label: "Sign in to your student dashboard" },
  });
  return { rendered, to: (me?.email as string | null) ?? null };
}

router.post("/admissions/settings/preview", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireSchoolAdmin(req, res);
  if (!schoolId) return;
  const { rendered } = await renderForAdmin(req, schoolId);
  res.json({ subject: rendered.subject, html: rendered.html });
});

router.post("/admissions/settings/test-email", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const schoolId = requireSchoolAdmin(req, res);
  if (!schoolId) return;
  const { rendered, to } = await renderForAdmin(req, schoolId);
  if (!to) {
    res.status(400).json({ error: "Your account has no email address" });
    return;
  }
  try {
    await sendEmailOrThrow(to, `[Test] ${rendered.subject}`, rendered.html, rendered.text);
    res.json({ sent: true, to });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Could not send the test email" });
  }
});

// ─── Applicant / admin: application status page ─────────────────────────────
async function loadApplicationFor(req: AuthenticatedRequest, res: Response, mode: "applicant" | "admin" | "either") {
  const id = paramId(req.params.id);
  const { data: app } = await supabaseAdmin.from("student_applications").select("*").eq("id", id).maybeSingle();
  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return null;
  }
  const isOwner = app.applicant_id === req.userId;
  const isSchoolAdmin = isAdmin(req) && (req.userRole === "super_admin" || app.school_id === req.schoolId);
  const ok = mode === "applicant" ? isOwner : mode === "admin" ? isSchoolAdmin : isOwner || isSchoolAdmin;
  if (!ok) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return { app: app as Record<string, unknown>, isOwner, isSchoolAdmin };
}

async function summarize(app: Record<string, unknown>, includeAdminFields: boolean) {
  const schoolId = app.school_id as string;
  const programId = (app.program_id as string | null) ?? null;
  const [{ data: school }, { data: program }, { data: plan }, { data: selections }] = await Promise.all([
    supabaseAdmin.from("schools").select("name, slug, logo_url").eq("id", schoolId).maybeSingle(),
    programId ? supabaseAdmin.from("programs").select("id, name").eq("id", programId).maybeSingle() : Promise.resolve({ data: null }),
    programId
      ? supabaseAdmin.from("tuition_plans").select("*").eq("program_id", programId).eq("school_id", schoolId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from("application_course_selections").select("course_id, courses ( id, title )").eq("application_id", app.id as string),
  ]);
  return {
    id: app.id,
    status: app.status,
    createdAt: app.created_at,
    updatedAt: app.updated_at,
    schoolId,
    schoolName: school?.name ?? null,
    schoolSlug: school?.slug ?? null,
    schoolLogoUrl: school?.logo_url ?? null,
    programId,
    programName: (program as { name?: string } | null)?.name ?? null,
    price: mapPrice(plan as Record<string, unknown> | null),
    courses: ((selections ?? []) as { course_id: string; courses?: { id: string; title: string } | { id: string; title: string }[] | null }[])
      .map((s) => (Array.isArray(s.courses) ? s.courses[0] : s.courses))
      .filter(Boolean),
    fee: {
      status: (app.fee_status as string | undefined) ?? "not_required",
      amountCents: (app.fee_amount_cents as number | null) ?? null,
      currency: (app.fee_currency as string | null) ?? null,
      paidAt: app.fee_paid_at ?? null,
      waivedAt: app.fee_waived_at ?? null,
    },
    ...(includeAdminFields
      ? {
          feeWaivedBy: app.fee_waived_by ?? null,
          feeWaiverReason: app.fee_waiver_reason ?? null,
          congratsEmail: {
            status: app.congrats_email_status ?? null,
            sentAt: app.congrats_email_sent_at ?? null,
            error: app.congrats_email_error ?? null,
          },
        }
      : {}),
  };
}

router.get("/applications/:id/summary", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const loaded = await loadApplicationFor(req, res, "either");
  if (!loaded) return;
  res.json(await summarize(loaded.app, loaded.isSchoolAdmin));
});

// ─── Applicant: pay the application fee ─────────────────────────────────────
router.post("/applications/:id/fee-checkout", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const loaded = await loadApplicationFor(req, res, "applicant");
  if (!loaded) return;
  const { app } = loaded;

  if (app.fee_status !== "awaiting_payment") {
    res.status(400).json({ error: app.fee_status === "paid" ? "This application fee is already paid." : "No application fee is due." });
    return;
  }
  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Online payment isn't available yet. Contact the school." });
    return;
  }
  const { data: school } = await supabaseAdmin
    .from("schools")
    .select("name, stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", app.school_id as string)
    .maybeSingle();
  if (!school?.stripe_connect_account_id || !school.stripe_connect_charges_enabled) {
    res.status(503).json({ error: "This school can't take online payments right now. Contact the school." });
    return;
  }

  const amount = app.fee_amount_cents as number;
  const currency = ((app.fee_currency as string) || "usd").toLowerCase();
  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: `Application fee - ${String(school.name ?? "School").slice(0, 200)}` },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        client_reference_id: app.id as string,
        metadata: { type: "application_fee", applicationId: app.id as string, schoolId: app.school_id as string },
        payment_intent_data: {
          metadata: { type: "application_fee", applicationId: app.id as string, schoolId: app.school_id as string },
        },
        success_url: `${APP_URL}/applications/${app.id}?checkout=success`,
        cancel_url: `${APP_URL}/applications/${app.id}?checkout=cancelled`,
      },
      { stripeAccount: school.stripe_connect_account_id as string }
    );
    await supabaseAdmin.from("student_applications").update({ fee_stripe_session_id: session.id }).eq("id", app.id as string);
    res.json({ url: session.url });
  } catch (err: any) {
    logger.error({ err }, "[admissions] failed to start application fee checkout");
    res.status(500).json({ error: err?.message ?? "Failed to start checkout" });
  }
});

/**
 * After the redirect back from Stripe, the webhook may not have arrived yet.
 * This asks Stripe directly about the session we created (on the school's
 * own account) and applies exactly the same checks as the webhook.
 */
router.post("/applications/:id/fee-checkout/confirm", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const loaded = await loadApplicationFor(req, res, "applicant");
  if (!loaded) return;
  const { app } = loaded;
  if (app.fee_status !== "awaiting_payment" || !app.fee_stripe_session_id || !isStripeConfigured()) {
    res.json({ feeStatus: app.fee_status ?? "not_required" });
    return;
  }
  const { data: school } = await supabaseAdmin
    .from("schools")
    .select("stripe_connect_account_id")
    .eq("id", app.school_id as string)
    .maybeSingle();
  const account = (school?.stripe_connect_account_id as string | null) ?? null;
  if (!account) {
    res.json({ feeStatus: app.fee_status });
    return;
  }
  try {
    const session = await getStripe().checkout.sessions.retrieve(app.fee_stripe_session_id as string, undefined, { stripeAccount: account });
    const decision = evaluateApplicationFeeSession({
      eventAccount: account,
      session: {
        id: session.id,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        metadata: (session.metadata as Record<string, string>) ?? null,
      },
      application: app as never,
      schoolAccountId: account,
    });
    if (decision.action === "mark_paid") {
      await supabaseAdmin
        .from("student_applications")
        .update({
          fee_status: "paid",
          fee_paid_at: new Date().toISOString(),
          fee_stripe_payment_intent_id:
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
        })
        .eq("id", app.id as string)
        .eq("fee_status", "awaiting_payment");
      res.json({ feeStatus: "paid" });
      return;
    }
  } catch (err) {
    logger.warn({ err }, "[admissions] could not confirm application fee session");
  }
  res.json({ feeStatus: app.fee_status });
});

// ─── Admin: waive the fee ───────────────────────────────────────────────────
router.post("/applications/:id/waive-fee", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const loaded = await loadApplicationFor(req, res, "admin");
  if (!loaded) return;
  const { app } = loaded;
  if (app.fee_status !== "awaiting_payment") {
    res.status(400).json({ error: "There's no unpaid application fee to waive." });
    return;
  }
  const reason = typeof (req.body as { reason?: unknown })?.reason === "string" ? ((req.body as { reason: string }).reason.trim().slice(0, 500) || null) : null;
  const { data, error } = await supabaseAdmin
    .from("student_applications")
    .update({ fee_status: "waived", fee_waived_by: req.userId, fee_waived_at: new Date().toISOString(), fee_waiver_reason: reason })
    .eq("id", app.id as string)
    .eq("fee_status", "awaiting_payment")
    .select()
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(409).json({ error: "The fee was paid or waived in the meantime. Refresh to see it." });
    return;
  }
  res.json(await summarize(data as Record<string, unknown>, true));
});

// ─── Admin: resend the congratulations email ────────────────────────────────
router.post("/applications/:id/resend-congratulations", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const loaded = await loadApplicationFor(req, res, "admin");
  if (!loaded) return;
  if (loaded.app.status !== "approved") {
    res.status(400).json({ error: "Only approved applications get a congratulations email." });
    return;
  }
  const result = await sendCongratulationsEmail(loaded.app);
  res.status(result.status === "sent" ? 200 : 502).json({ congratsEmail: result, ...(result.error ? { error: result.error } : {}) });
});

export default router;
