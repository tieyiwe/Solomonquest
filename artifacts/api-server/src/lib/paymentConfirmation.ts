import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { isSmtpConfigured, sendEmailStrict } from "./email";
import { getSchoolPaymentInfo, type LedgerRow } from "./tuitionLedger";
import { buildReceipt } from "./tuitionBalances";
import { receiptEmailHtml } from "./tuitionEmails";
import { formatMoney } from "./tuitionLedgerCore";

/**
 * Tell the student a tuition payment was received, every time one is
 * recorded (full or partial; by an admin, by Stripe, or a test payment).
 *
 * - Email: the school-branded receipt, which lists what the payment covered
 *   and the remaining balance. Payment receipts are transactional, so they go
 *   out regardless of the "Tuition & balances" notification preference (that
 *   preference still controls balance *reminders*).
 * - In-app: "Payment received" with the amount and remaining balance, linking
 *   to the receipt.
 *
 * Fire-and-forget: never throws, so a failed email can't undo or block the
 * payment itself. The admin can still resend from the receipt.
 */
export async function sendPaymentConfirmation(entry: LedgerRow): Promise<void> {
  if (entry.kind !== "payment" || entry.voided_at) return;
  try {
    const school = await getSchoolPaymentInfo(entry.school_id);
    const receipt = await buildReceipt(entry, school.name);
    const path = `/receipts/${entry.id}`;
    const paid = formatMoney(receipt.amountCents, receipt.currency);
    const owing = receipt.remaining.filter((r) => r.outstandingCents > 0);
    const remainingText = owing.length
      ? `Remaining balance: ${owing.map((r) => formatMoney(r.outstandingCents, r.currency)).join(" + ")}.`
      : "Your tuition is now paid in full.";

    const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
      user_id: entry.student_id,
      type: "tuition_payment_received",
      title: `Payment received: ${paid}`,
      body: `${school.name} received your payment of ${paid}. ${remainingText}`,
      link: path,
      metadata: { ledgerEntryId: entry.id, receiptNumber: entry.receipt_number },
      is_read: false,
    });
    if (notifyError) logger.error({ err: notifyError }, "payment confirmation: notification insert failed");

    if (receipt.studentEmail && isSmtpConfigured()) {
      const subject = `${school.name}: payment received (${paid})${receipt.receiptNumber ? `, receipt ${receipt.receiptNumber}` : ""}`;
      await sendEmailStrict(
        receipt.studentEmail,
        subject,
        receiptEmailHtml(receipt, { name: school.name, logoUrl: school.logoUrl }, path)
      );
    }
  } catch (err) {
    logger.error({ err, entryId: entry.id }, "payment confirmation failed");
  }
}
