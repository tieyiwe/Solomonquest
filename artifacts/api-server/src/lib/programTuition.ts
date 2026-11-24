/**
 * Tuition records, shared by POST /tuition-payments and by application
 * approval (a student approved into a priced program gets that program's
 * tuition on their Tuition page without having to start it themselves).
 *
 * The storage calls are passed in, so the rules (which plan, which method,
 * idempotency, installment split) can be unit-tested without a database.
 */

export interface InstallmentRow {
  payment_id: string;
  installment_number: number;
  amount_cents: number;
  due_date: string;
  status: "pending";
}

/**
 * Splits a total evenly across installments (remainder on the last one so
 * cents always add up), due monthly from `now`. Built in UTC with the
 * day-of-month clamped, so Jan 31 + 1 month is Feb 28, never Mar 3, and a
 * server ahead of UTC doesn't shift every due date a day early.
 */
export function buildInstallmentRows(paymentId: string, amountCents: number, count: number, now: Date = new Date()): InstallmentRow[] {
  const n = Math.max(1, Math.floor(count));
  const base = Math.floor(amountCents / n);
  const remainder = amountCents - base * n;
  return Array.from({ length: n }, (_, i) => {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + i;
    const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(now.getUTCDate(), lastDayOfTargetMonth);
    const dueDate = new Date(Date.UTC(year, month, day));
    return {
      payment_id: paymentId,
      installment_number: i + 1,
      amount_cents: base + (i === n - 1 ? remainder : 0),
      due_date: dueDate.toISOString().slice(0, 10),
      status: "pending" as const,
    };
  });
}

export interface PlanRow {
  id: string;
  school_id: string;
  course_id: string | null;
  program_id: string | null;
  amount_cents: number;
  currency: string | null;
  allow_full_payment: boolean;
  allow_installments: boolean;
  installment_count: number;
}

export interface TuitionRepo {
  findProgramPlan(schoolId: string, programId: string): Promise<PlanRow | null>;
  findPayment(studentId: string, planId: string): Promise<{ id: string; amount_cents: number; currency: string | null } | null>;
  insertPayment(row: Record<string, unknown>): Promise<{ id: string } | null>;
  insertInstallments(rows: InstallmentRow[]): Promise<boolean>;
  deletePayment(id: string): Promise<void>;
}

export type EnsureTuitionResult =
  | { outcome: "free" }
  | { outcome: "existing" | "created"; paymentId: string; amountCents: number; currency: string; installmentCount: number }
  | { outcome: "error"; message: string };

/**
 * Makes sure an approved student has a tuition record for their program's
 * plan. Free programs (no plan, or amount 0) get nothing. Running it twice
 * returns the existing record instead of creating a second one.
 */
export async function ensureProgramTuitionPayment(
  repo: TuitionRepo,
  args: { schoolId: string; studentId: string; programId: string | null | undefined; now?: Date }
): Promise<EnsureTuitionResult> {
  if (!args.programId) return { outcome: "free" };
  const plan = await repo.findProgramPlan(args.schoolId, args.programId);
  if (!plan || plan.school_id !== args.schoolId || !(plan.amount_cents > 0)) return { outcome: "free" };

  const currency = (plan.currency || "usd").toLowerCase();
  const method: "full" | "installments" = plan.allow_full_payment || !plan.allow_installments ? "full" : "installments";
  const installmentCount = method === "installments" ? Math.max(2, plan.installment_count || 2) : 1;

  const existing = await repo.findPayment(args.studentId, plan.id);
  if (existing) {
    return {
      outcome: "existing",
      paymentId: existing.id,
      amountCents: existing.amount_cents,
      currency: (existing.currency || currency).toLowerCase(),
      installmentCount,
    };
  }

  const payment = await repo.insertPayment({
    school_id: plan.school_id,
    student_id: args.studentId,
    tuition_plan_id: plan.id,
    course_id: plan.course_id,
    program_id: plan.program_id,
    amount_cents: plan.amount_cents,
    currency,
    payment_method: method,
    installment_count: installmentCount,
    status: "pending",
    provider: "manual",
  });
  if (!payment) return { outcome: "error", message: "Failed to create the tuition record" };

  const ok = await repo.insertInstallments(buildInstallmentRows(payment.id, plan.amount_cents, installmentCount, args.now));
  if (!ok) {
    // No transaction spans the two inserts; without this an orphan payment
    // with no installments would read as "already paid".
    await repo.deletePayment(payment.id);
    return { outcome: "error", message: "Failed to create the tuition installments" };
  }

  return { outcome: "created", paymentId: payment.id, amountCents: plan.amount_cents, currency, installmentCount };
}
