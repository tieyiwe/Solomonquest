import { supabaseAdmin } from "./supabase";
import {
  allocationDiff,
  computeStatement,
  filterAndSortRows,
  METHOD_LABEL,
  type BalanceFilter,
  type PaymentMethod,
  type CurrencyTotals,
} from "./tuitionLedgerCore";
import { lastRemindedMap, loadStudentLedgers, profileNames, toLite, type LedgerRow, type StudentLedger } from "./tuitionLedger";
import type { ReceiptView } from "./tuitionEmails";

/** One row of the admin "Student balances" view. */
export interface BalanceRow {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  status: "paid" | "partial" | "owing" | "overdue";
  paymentStatus: "paid" | "partial" | "owing";
  isOverdue: boolean;
  currency: string;
  totalBilledCents: number;
  totalPaidCents: number;
  totalDiscountCents: number;
  balanceCents: number;
  creditCents: number;
  overdueCents: number;
  /** Totals in any other currency the student is billed in. */
  otherCurrencies: CurrencyTotals[];
  nextDueDate: string | null;
  nextDueAmountCents: number | null;
  lastPaymentAt: string | null;
  lastRemindedAt: string | null;
  plans: { paymentId: string; label: string; currency: string }[];
  programIds: string[];
  courseIds: string[];
  paymentCount: number;
  outstandingItemCount: number;
  /** Pre-ledger field name, kept so older clients keep working (= billed). */
  totalOwedCents: number;
}

function toRow(l: StudentLedger, profile: Record<string, unknown> | undefined, lastReminded: string | null): BalanceRow {
  const st = l.statement;
  const p = st.primary;
  const plans = new Map<string, { paymentId: string; label: string; currency: string }>();
  for (const i of l.items) if (!plans.has(i.paymentId)) plans.set(i.paymentId, { paymentId: i.paymentId, label: i.planLabel, currency: i.currency });
  return {
    studentId: l.studentId,
    studentName: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Unknown" : "Unknown",
    studentEmail: (profile?.email as string) ?? null,
    status: st.status,
    paymentStatus: st.paymentStatus,
    isOverdue: st.isOverdue,
    currency: p.currency,
    totalBilledCents: p.billedCents,
    totalPaidCents: p.paidCents,
    totalDiscountCents: p.discountCents,
    balanceCents: p.outstandingCents,
    creditCents: p.creditCents,
    overdueCents: p.overdueCents,
    otherCurrencies: st.totals.slice(1),
    nextDueDate: st.nextDue?.dueDate ?? null,
    nextDueAmountCents: st.nextDue?.amountCents ?? null,
    lastPaymentAt: st.lastPaymentOn,
    lastRemindedAt: lastReminded,
    plans: Array.from(plans.values()),
    programIds: Array.from(new Set(l.items.map((i) => i.programId).filter(Boolean) as string[])),
    courseIds: Array.from(new Set(l.items.map((i) => i.courseId).filter(Boolean) as string[])),
    paymentCount: plans.size,
    outstandingItemCount: st.outstandingItemCount,
    totalOwedCents: p.billedCents,
  };
}

export async function buildBalanceRows(schoolId: string, filter: BalanceFilter = {}) {
  const ledgers = await loadStudentLedgers(schoolId);
  const ids = Array.from(ledgers.keys());
  const profiles = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", ids.slice(i, i + 200));
    for (const p of data ?? []) profiles.set(p.id as string, p as Record<string, unknown>);
  }
  const reminded = await lastRemindedMap(schoolId, ids);
  const all = ids
    .map((id) => toRow(ledgers.get(id)!, profiles.get(id), reminded.get(id) ?? null))
    // Students with no bill and no ledger activity aren't interesting here.
    .filter((r) => r.totalBilledCents > 0 || r.totalPaidCents !== 0 || r.creditCents > 0);
  const rows = filterAndSortRows(all, filter);
  const legacy = Array.from(ledgers.values()).some((l) => l.legacy);
  return { all, rows, legacy };
}

export function statusCounts(rows: BalanceRow[]) {
  return {
    all: rows.length,
    paid: rows.filter((r) => r.status === "paid").length,
    partial: rows.filter((r) => r.status === "partial").length,
    owing: rows.filter((r) => r.status === "owing").length,
    overdue: rows.filter((r) => r.status === "overdue").length,
    withBalance: rows.filter((r) => r.balanceCents > 0).length,
  };
}

function itemLabel(l: StudentLedger, itemId: string): string {
  const i = l.items.find((x) => x.id === itemId);
  if (!i) return "Tuition";
  return i.installmentCount > 1 ? `${i.planLabel}, installment ${i.installmentNumber} of ${i.installmentCount}` : i.planLabel;
}

/** Build the receipt for one ledger entry, as it stood when it was recorded. */
export async function buildReceipt(entry: LedgerRow, schoolName: string): Promise<ReceiptView & { studentId: string; entryId: string }> {
  const ledgers = await loadStudentLedgers(entry.school_id, { studentIds: [entry.student_id] });
  const l = ledgers.get(entry.student_id) ?? { studentId: entry.student_id, items: [], entries: [], statement: computeStatement([], []), legacy: false };
  const lites = l.entries.map(toLite);
  const asOf = entry.recorded_at;
  const self = lites.find((e) => e.id === entry.id);
  const withIt = computeStatement(l.items, lites.map((e) => (e.id === entry.id ? { ...e, voidedAt: null } : e)), { asOf });
  const without = computeStatement(l.items, lites.filter((e) => e.id !== entry.id), { asOf });
  const appliedTo = self
    ? allocationDiff(without, withIt)
        .filter((d) => (entry.kind === "refund" ? d.deltaCents < 0 : d.deltaCents > 0))
        .map((d) => ({ label: itemLabel(l, d.itemId), amountCents: Math.abs(d.deltaCents) }))
    : [];
  const names = await profileNames([entry.student_id, entry.recorded_by ?? ""]);
  const { data: student } = await supabaseAdmin.from("profiles").select("email").eq("id", entry.student_id).maybeSingle();
  const plan = entry.payment_id ? l.items.find((i) => i.paymentId === entry.payment_id)?.planLabel ?? null : null;
  return {
    entryId: entry.id,
    studentId: entry.student_id,
    receiptNumber: entry.receipt_number,
    schoolName,
    studentName: names.get(entry.student_id) ?? "Student",
    studentEmail: (student?.email as string) ?? null,
    kind: entry.kind,
    amountCents: Math.abs(entry.amount_cents),
    currency: entry.currency,
    methodLabel: entry.method ? METHOD_LABEL[entry.method as PaymentMethod] ?? entry.method : null,
    reference: entry.reference,
    paidOn: entry.paid_on,
    planLabel: plan,
    appliedTo,
    remaining: withIt.totals.map((t) => ({ currency: t.currency, outstandingCents: t.outstandingCents, creditCents: t.creditCents })),
    recordedByName: entry.recorded_by ? names.get(entry.recorded_by) ?? null : null,
    voided: !!entry.voided_at,
    voidReason: entry.void_reason,
    note: entry.note,
  };
}
