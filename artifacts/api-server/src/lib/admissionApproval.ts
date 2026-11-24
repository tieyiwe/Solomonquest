import type Stripe from "stripe";
import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { enrollStudentInCourse } from "./enrollment";
import { invalidateCachedProfile } from "./profileCache";
import { isFeatureEnabled } from "./featureFlags";
import { sendEmailOrThrow } from "./email";
import { renderAdmissionEmail, type RenderedEmail } from "./admissionEmail";
import {
  applyProgramOverride,
  detailsFromRow,
  evaluateApplicationFeeSession,
  type AdmissionDetails,
  type NextStep,
  type SchoolFeeConfig,
} from "./admissions";
import { ensureProgramTuitionPayment, type EnsureTuitionResult, type PlanRow, type TuitionRepo } from "./programTuition";

/**
 * Database-side admissions work: what happens when an application is
 * approved (enrolment, tuition, the congratulations email, the bell
 * notification) and when Stripe reports an application fee paid. The rules
 * themselves live in ./admissions.ts and ./programTuition.ts.
 */

export const APP_URL = (process.env.APP_URL ?? process.env.FRONTEND_URL ?? "https://app.solomonquest.com").replace(/\/+$/, "");

// ─── Settings loaders ────────────────────────────────────────────────────────

/** The school's admission settings row, or null (never configured, or the migration hasn't run). */
export async function loadSchoolAdmissionSettings(schoolId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from("school_admission_settings")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error }, "[admissions] could not read school_admission_settings (run admissions-pricing.sql?)");
    return null;
  }
  return (data as Record<string, unknown>) ?? null;
}

export async function loadProgramOverride(programId: string | null | undefined, schoolId: string): Promise<Record<string, unknown> | null> {
  if (!programId) return null;
  const { data, error } = await supabaseAdmin
    .from("program_admission_settings")
    .select("*")
    .eq("program_id", programId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown>) ?? null;
}

export function feeConfigFromRow(row: Record<string, unknown> | null): SchoolFeeConfig | null {
  if (!row) return null;
  return {
    enabled: row.application_fee_enabled === true,
    amountCents: Number(row.application_fee_cents ?? 0),
    currency: String(row.application_fee_currency ?? "usd"),
  };
}

export async function loadProgramPlan(schoolId: string, programId: string): Promise<PlanRow | null> {
  const { data } = await supabaseAdmin
    .from("tuition_plans")
    .select("*")
    .eq("school_id", schoolId)
    .eq("program_id", programId)
    .maybeSingle();
  return (data as PlanRow | null) ?? null;
}

export const supabaseTuitionRepo: TuitionRepo = {
  findProgramPlan: loadProgramPlan,
  async findPayment(studentId, planId) {
    const { data } = await supabaseAdmin
      .from("tuition_payments")
      .select("id, amount_cents, currency")
      .eq("student_id", studentId)
      .eq("tuition_plan_id", planId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as { id: string; amount_cents: number; currency: string | null } | null) ?? null;
  },
  async insertPayment(row) {
    const { data, error } = await supabaseAdmin.from("tuition_payments").insert(row).select("id").single();
    if (error) logger.error({ err: error }, "[admissions] failed to create tuition payment");
    return (data as { id: string } | null) ?? null;
  },
  async insertInstallments(rows) {
    const { error } = await supabaseAdmin.from("tuition_installments").insert(rows);
    if (error) logger.error({ err: error }, "[admissions] failed to create tuition installments");
    return !error;
  },
  async deletePayment(id) {
    await supabaseAdmin.from("tuition_payments").delete().eq("id", id);
  },
};

// ─── Congratulations email ──────────────────────────────────────────────────

function overrideFromRow(row: Record<string, unknown> | null): { congratsMessage: string | null; nextSteps: NextStep[] | null } | null {
  if (!row) return null;
  return {
    congratsMessage: (row.congrats_message as string | null) ?? null,
    nextSteps: Array.isArray(row.next_steps) ? (row.next_steps as NextStep[]) : null,
  };
}

/** The details used for one program: the school's, with that program's overrides on top. */
export async function effectiveDetails(schoolId: string, programId: string | null | undefined): Promise<AdmissionDetails> {
  const [settings, override] = await Promise.all([loadSchoolAdmissionSettings(schoolId), loadProgramOverride(programId, schoolId)]);
  return applyProgramOverride(detailsFromRow(settings), overrideFromRow(override));
}

/**
 * The account link for an applicant. Applicants sign up before applying, so
 * normally this is "Sign in". If they somehow never signed in (account made
 * for them), a password-setup link is generated instead.
 */
async function accountLinkFor(applicantId: string, email: string): Promise<{ url: string; label: string; hint?: string }> {
  const signIn = { url: `${APP_URL}/auth/login`, label: "Sign in to your student dashboard" };
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(applicantId);
    if (data?.user && !data.user.last_sign_in_at) {
      const { data: link } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${APP_URL}/auth/reset-password` },
      });
      const url = link?.properties?.action_link;
      if (url && /^https?:\/\//i.test(url)) {
        return { url, label: "Set up your account", hint: "This link lets you choose a password. It expires after a short time." };
      }
    }
  } catch (err) {
    logger.warn({ err }, "[admissions] could not check applicant sign-in state; using the sign-in link");
  }
  return signIn;
}

export interface CongratsEmailResult {
  status: "sent" | "failed";
  error?: string;
  sentAt?: string;
}

interface RenderContext {
  rendered: RenderedEmail;
  to: string | null;
}

async function buildCongratsEmail(app: Record<string, unknown>): Promise<RenderContext> {
  const schoolId = app.school_id as string;
  const programId = (app.program_id as string | null) ?? null;

  const [{ data: profile }, { data: school }, { data: program }, details, plan] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, email, first_name, last_name").eq("id", app.applicant_id as string).maybeSingle(),
    supabaseAdmin.from("schools").select("name, logo_url").eq("id", schoolId).maybeSingle(),
    programId
      ? supabaseAdmin.from("programs").select("name").eq("id", programId).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    effectiveDetails(schoolId, programId),
    programId ? loadProgramPlan(schoolId, programId) : Promise.resolve(null),
  ]);

  const studentName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "there" : "there";
  const email = (profile?.email as string | null) ?? null;

  let tuition: Parameters<typeof renderAdmissionEmail>[0]["tuition"] = null;
  if (plan && plan.amount_cents > 0) {
    tuition = {
      amountCents: plan.amount_cents,
      currency: plan.currency || "usd",
      installmentCount: plan.allow_full_payment || !plan.allow_installments ? 1 : plan.installment_count,
      pricingNote: ((plan as unknown as Record<string, unknown>).pricing_note as string | null) ?? null,
      url: `${APP_URL}/dashboard/student/tuition`,
    };
  }

  const account = email
    ? await accountLinkFor(app.applicant_id as string, email)
    : { url: `${APP_URL}/auth/login`, label: "Sign in to your student dashboard" };

  const rendered = renderAdmissionEmail({
    details,
    studentName,
    programName: (program?.name as string | undefined) ?? null,
    school: { name: (school?.name as string) ?? "Your school", logoUrl: (school?.logo_url as string | null) ?? null },
    tuition,
    account,
  });
  return { rendered, to: email };
}

/**
 * Sends the congratulations email for an approved application and records
 * the outcome on the application. Never throws: approval must not fail
 * because email did.
 */
export async function sendCongratulationsEmail(app: Record<string, unknown>): Promise<CongratsEmailResult> {
  let result: CongratsEmailResult;
  try {
    const { rendered, to } = await buildCongratsEmail(app);
    if (!to) throw new Error("The applicant has no email address on file");
    await sendEmailOrThrow(to, rendered.subject, rendered.html, rendered.text);
    result = { status: "sent", sentAt: new Date().toISOString() };
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "Unknown error").slice(0, 500);
    logger.error({ err, applicationId: app.id }, "[admissions] congratulations email could not be sent");
    result = { status: "failed", error: message };
  }

  const { error } = await supabaseAdmin
    .from("student_applications")
    .update({
      congrats_email_status: result.status,
      congrats_email_sent_at: result.sentAt ?? null,
      congrats_email_error: result.error ?? null,
    })
    .eq("id", app.id as string);
  if (error) logger.warn({ err: error }, "[admissions] could not record congratulations email status");

  return result;
}

// ─── Approval side effects ──────────────────────────────────────────────────

export interface ApprovalOutcome {
  tuition: EnsureTuitionResult;
  congratsEmail: CongratsEmailResult;
}

/**
 * Runs once per approval (the caller makes sure the status actually changed):
 * enrols the student, makes them a student of the school, creates the
 * program's tuition record, notifies them in-app and emails them.
 */
export async function runApprovalSideEffects(app: Record<string, unknown>): Promise<ApprovalOutcome> {
  const applicationId = app.id as string;
  const applicantId = app.applicant_id as string;
  const schoolId = app.school_id as string;
  const programId = (app.program_id as string | null) ?? null;

  // 1. Enrol in the selected courses (each cascades to its program's other courses).
  const { data: selections } = await supabaseAdmin
    .from("application_course_selections")
    .select("course_id")
    .eq("application_id", applicationId);
  let courseIds = (selections ?? []).map((s) => s.course_id as string);
  if (courseIds.length === 0 && programId) {
    const { data: programCourses } = await supabaseAdmin.from("courses").select("id").eq("program_id", programId).eq("school_id", schoolId);
    courseIds = (programCourses ?? []).map((c) => c.id as string);
  }
  for (const courseId of courseIds) {
    try {
      await enrollStudentInCourse(courseId, applicantId);
    } catch (err: any) {
      logger.error({ err }, "[applications] Failed to enroll student in course");
    }
  }

  // 2. Make them a student of this school.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ role: "student", school_id: schoolId })
    .eq("id", applicantId);
  if (profileError) logger.error({ err: profileError }, "[applications] Failed to update student profile");
  else invalidateCachedProfile(applicantId);

  // 3. Tuition for a priced program (idempotent).
  const tuition = await ensureTuitionForApplication(app);

  // 4. In-app notification.
  const { data: school } = await supabaseAdmin.from("schools").select("name").eq("id", schoolId).maybeSingle();
  const schoolName = (school?.name as string) ?? "your school";
  const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
    user_id: applicantId,
    type: "application_approved",
    title: `Congratulations! You've been admitted to ${schoolName}`,
    body:
      tuition.outcome === "created" || tuition.outcome === "existing"
        ? "Your application was approved. Check your email for next steps, and see your Tuition page for what's due."
        : "Your application was approved. Check your email for next steps.",
    link: tuition.outcome === "created" || tuition.outcome === "existing" ? "/dashboard/student/tuition" : "/dashboard/student",
    metadata: { applicationId },
    is_read: false,
  });
  if (notifyError) logger.warn({ err: notifyError }, "[applications] Failed to create approval notification");

  // 5. The school's congratulations email.
  const congratsEmail = await sendCongratulationsEmail(app);

  return { tuition, congratsEmail };
}

export async function ensureTuitionForApplication(app: Record<string, unknown>): Promise<EnsureTuitionResult> {
  const schoolId = app.school_id as string;
  if (!(await isFeatureEnabled(schoolId, "tuition"))) return { outcome: "free" };
  const result = await ensureProgramTuitionPayment(supabaseTuitionRepo, {
    schoolId,
    studentId: app.applicant_id as string,
    programId: (app.program_id as string | null) ?? null,
  });
  if ((result.outcome === "created" || result.outcome === "existing") && app.tuition_payment_id !== result.paymentId) {
    await supabaseAdmin.from("student_applications").update({ tuition_payment_id: result.paymentId }).eq("id", app.id as string);
  }
  if (result.outcome === "error") logger.error({ applicationId: app.id, message: result.message }, "[applications] tuition not created");
  return result;
}

// ─── Application fee webhook ────────────────────────────────────────────────

/**
 * Handles a Checkout Session tagged `type: application_fee`. Returns a short
 * description of what happened (for logs/tests); never throws for a bad or
 * foreign session -- those are acknowledged and ignored.
 */
export async function handleApplicationFeeSession(
  eventAccount: string | null | undefined,
  session: Stripe.Checkout.Session
): Promise<string> {
  const applicationId = session.metadata?.applicationId;
  if (!applicationId) return "ignored: missing applicationId";

  const { data: application } = await supabaseAdmin
    .from("student_applications")
    .select("id, school_id, fee_status, fee_amount_cents, fee_currency")
    .eq("id", applicationId)
    .maybeSingle();

  const schoolId = (application?.school_id as string | undefined) ?? null;
  const { data: school } = schoolId
    ? await supabaseAdmin.from("schools").select("stripe_connect_account_id").eq("id", schoolId).maybeSingle()
    : { data: null };

  const decision = evaluateApplicationFeeSession({
    eventAccount,
    session: {
      id: session.id,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
      metadata: (session.metadata as Record<string, string>) ?? null,
    },
    application: application as never,
    schoolAccountId: (school?.stripe_connect_account_id as string | null) ?? null,
  });

  if (decision.action !== "mark_paid") {
    logger.warn({ applicationId, sessionId: session.id, reason: decision.reason }, "[stripe] application fee session ignored");
    return `ignored: ${decision.reason}`;
  }

  // Conditional on still awaiting payment, so two concurrent deliveries of
  // the same event can't both "pay" it (and paid_at never moves forward).
  const { data: updated, error } = await supabaseAdmin
    .from("student_applications")
    .update({
      fee_status: "paid",
      fee_paid_at: new Date().toISOString(),
      fee_stripe_session_id: session.id,
      fee_stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    })
    .eq("id", applicationId)
    .eq("fee_status", "awaiting_payment")
    .select("id, applicant_id, school_id")
    .maybeSingle();

  if (error) throw error;
  if (!updated) return "ignored: replay";

  // Tell the school's admins a paid application is ready to review.
  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("school_id", updated.school_id as string)
    .eq("role", "admin");
  if (admins && admins.length) {
    await supabaseAdmin.from("notifications").insert(
      admins.map((a) => ({
        user_id: a.id,
        type: "application_fee_paid",
        title: "Application fee paid",
        body: "An applicant paid their application fee. The application is ready to review.",
        link: "/dashboard/admin/admissions",
        metadata: { applicationId },
        is_read: false,
      }))
    );
  }
  logger.info({ applicationId, sessionId: session.id }, "[stripe] application fee recorded");
  return "paid";
}
