import { logger } from "./logger";
import { loadStudentLedger, recordLedgerEntry, LedgerUnavailableError } from "./tuitionLedger";
import { sendPaymentConfirmation } from "./paymentConfirmation";

/**
 * Small hooks the existing tuition paths (simulate-pay, Stripe checkout and
 * webhook) call so every payment lands in the ledger. They never throw: if
 * the ledger isn't set up yet (tuition-ledger.sql not run) the old
 * behaviour carries on unchanged.
 */

/** What's still owed on one installment, per the ledger (falls back to `fallbackCents`). */
export async function remainingForInstallment(
  schoolId: string,
  studentId: string,
  installmentId: string,
  fallbackCents: number
): Promise<number> {
  try {
    const l = await loadStudentLedger(schoolId, studentId);
    if (l.legacy) return fallbackCents;
    const a = l.statement.items.find((x) => x.item.id === installmentId);
    return a ? a.remainingCents : fallbackCents;
  } catch {
    return fallbackCents;
  }
}

/**
 * Record money received against one installment. `amountCents` defaults to
 * whatever the ledger says is still owed on it; nothing is written when that
 * is zero (already covered).
 */
export async function recordInstallmentPayment(input: {
  schoolId: string;
  studentId: string;
  paymentId: string;
  installmentId: string;
  currency?: string | null;
  amountCents?: number | null;
  source: "manual" | "stripe" | "simulated";
  method: "online" | "other";
  reference?: string | null;
  note?: string | null;
  recordedBy?: string | null;
}): Promise<void> {
  try {
    let amount = input.amountCents ?? null;
    if (amount === null) {
      const l = await loadStudentLedger(input.schoolId, input.studentId);
      if (l.legacy) return;
      amount = l.statement.items.find((x) => x.item.id === input.installmentId)?.remainingCents ?? 0;
    }
    if (!amount || amount <= 0) return;
    const entry = await recordLedgerEntry({
      schoolId: input.schoolId,
      studentId: input.studentId,
      kind: "payment",
      amountCents: amount,
      currency: input.currency,
      paymentId: input.paymentId,
      installmentId: input.installmentId,
      method: input.method,
      reference: input.reference ?? null,
      note: input.note ?? null,
      source: input.source,
      recordedBy: input.recordedBy ?? null,
    });
    // Stripe / test payments get the same email + in-app receipt as manual ones.
    void sendPaymentConfirmation(entry);
  } catch (err) {
    if (err instanceof LedgerUnavailableError) return;
    logger.error({ err, installmentId: input.installmentId }, "tuition ledger: failed to record installment payment");
  }
}
