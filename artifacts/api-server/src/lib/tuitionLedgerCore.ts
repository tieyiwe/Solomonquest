/**
 * Pure tuition balance + ledger logic (no database, no imports), so it can be
 * unit-tested directly with `node --experimental-strip-types`.
 *
 * Model
 * ─────
 * - What a student is billed: the installments of each of their
 *   tuition_payments rows (one row = one tuition plan the student is on).
 *   A payment row with no installments bills its full amount as one item.
 * - What has happened since: the non-voided rows of tuition_ledger_entries.
 *     payment                 cash in            (credit)
 *     discount / waiver       non-cash reduction (credit)
 *     adjustment  > 0         non-cash reduction (credit)
 *     adjustment  < 0         extra charge       (debit)
 *     refund                  cash out           (debit)
 * - Balances are always computed, never stored:
 *     billed      = installments + extra charges
 *     paid        = payments − refunds
 *     discounts   = discounts + waivers + positive adjustments
 *     outstanding = what is still owed on items (never negative)
 *     credit      = money received beyond everything billed
 *   and billed − paid − discounts = outstanding − credit, always.
 *
 * Allocation (which installment a credit pays) is also computed:
 *   1. credits earmarked for an installment go to that installment;
 *   2. credits earmarked for a plan (payment_id) go to that plan's
 *      installments, oldest due date first;
 *   3. everything else, and any excess from 1–2, goes to the oldest
 *      outstanding installment across all plans in the same currency;
 *   4. what's left is credit. Debits first use up credit, then reopen the
 *      most recently due covered installments.
 * Each currency is computed separately; money in one currency never pays an
 * installment billed in another.
 */

export type LedgerKind = "payment" | "adjustment" | "discount" | "refund" | "waiver";

export const LEDGER_KINDS: LedgerKind[] = ["payment", "adjustment", "discount", "refund", "waiver"];

export const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque", "mobile_money", "card_in_person", "online", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  mobile_money: "Mobile money",
  card_in_person: "Card (in person)",
  online: "Online (card)",
  other: "Other",
};

export interface BillItem {
  /** installment id, or `payment:<paymentId>` for a plan with no installment rows */
  id: string;
  paymentId: string;
  installmentNumber: number;
  installmentCount: number;
  amountCents: number;
  dueDate: string | null;
  currency: string;
  /** Plan name, e.g. "Diploma in Ministry". */
  planLabel: string;
  programId?: string | null;
  courseId?: string | null;
  /** Status currently stored on the installment row (for sync). */
  storedStatus?: string | null;
  paymentCreatedAt?: string | null;
}

export interface LedgerEntryLite {
  id: string;
  paymentId: string | null;
  installmentId: string | null;
  amountCents: number;
  currency: string;
  kind: LedgerKind;
  paidOn: string;
  recordedAt: string;
  voidedAt: string | null;
}

export interface ItemAllocation {
  item: BillItem;
  appliedCents: number;
  remainingCents: number;
  status: "paid" | "partial" | "pending";
  overdue: boolean;
}

export interface CurrencyTotals {
  currency: string;
  billedCents: number;
  paidCents: number;
  discountCents: number;
  refundCents: number;
  outstandingCents: number;
  creditCents: number;
  overdueCents: number;
}

export type BalanceStatus = "paid" | "partial" | "owing" | "overdue";

export interface Statement {
  items: ItemAllocation[];
  totals: CurrencyTotals[];
  /** Currency with the largest outstanding (then the largest bill). */
  primaryCurrency: string;
  primary: CurrencyTotals;
  status: BalanceStatus;
  /** paid / partial / owing — the pre-ledger three-way status. */
  paymentStatus: "paid" | "partial" | "owing";
  isOverdue: boolean;
  nextDue: { dueDate: string | null; amountCents: number; currency: string; itemId: string } | null;
  lastPaymentOn: string | null;
  outstandingItemCount: number;
}

export function normCurrency(c: string | null | undefined): string {
  return (c || "usd").toLowerCase();
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Positive = credit to the student, negative = debit. */
export function signedEffect(e: Pick<LedgerEntryLite, "kind" | "amountCents">): number {
  if (e.kind === "refund") return -Math.abs(e.amountCents);
  if (e.kind === "adjustment") return e.amountCents;
  return Math.abs(e.amountCents);
}

function sortItems(items: BillItem[]): BillItem[] {
  return [...items].sort((a, b) => {
    const da = a.dueDate ?? "9999-12-31";
    const db = b.dueDate ?? "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    const ca = a.paymentCreatedAt ?? "";
    const cb = b.paymentCreatedAt ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    if (a.paymentId !== b.paymentId) return a.paymentId < b.paymentId ? -1 : 1;
    return a.installmentNumber - b.installmentNumber;
  });
}

function byRecorded(a: LedgerEntryLite, b: LedgerEntryLite): number {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Entries that count: not voided (optionally "as of" a moment in time). */
export function activeEntries(entries: LedgerEntryLite[], asOf?: string): LedgerEntryLite[] {
  return entries.filter((e) => {
    if (asOf) {
      if (e.recordedAt > asOf) return false;
      return !e.voidedAt || e.voidedAt > asOf;
    }
    return !e.voidedAt;
  });
}

export function computeStatement(
  items: BillItem[],
  entries: LedgerEntryLite[],
  opts: { today?: string; asOf?: string } = {}
): Statement {
  const today = opts.today ?? todayUtc();
  const live = activeEntries(entries, opts.asOf).sort(byRecorded);
  const sorted = sortItems(items.map((i) => ({ ...i, currency: normCurrency(i.currency) })));

  const currencies = new Set<string>();
  for (const i of sorted) currencies.add(i.currency);
  for (const e of live) currencies.add(normCurrency(e.currency));

  const applied = new Map<string, number>();
  for (const i of sorted) applied.set(i.id, 0);
  const totals: CurrencyTotals[] = [];

  for (const cur of currencies) {
    const curItems = sorted.filter((i) => i.currency === cur);
    const curEntries = live.filter((e) => normCurrency(e.currency) === cur);
    const remaining = (i: BillItem) => i.amountCents - (applied.get(i.id) ?? 0);
    const apply = (pool: number, targets: BillItem[]): number => {
      for (const t of targets) {
        if (pool <= 0) break;
        const r = remaining(t);
        if (r <= 0) continue;
        const take = Math.min(r, pool);
        applied.set(t.id, (applied.get(t.id) ?? 0) + take);
        pool -= take;
      }
      return pool;
    };

    let payments = 0, refunds = 0, discounts = 0, charges = 0;
    const credits: { e: LedgerEntryLite; amount: number }[] = [];
    let debitTotal = 0;
    for (const e of curEntries) {
      const eff = signedEffect(e);
      if (e.kind === "payment") payments += eff;
      else if (e.kind === "refund") refunds += -eff;
      else if (eff > 0) discounts += eff;
      else charges += -eff;
      if (eff > 0) credits.push({ e, amount: eff });
      else debitTotal += -eff;
    }

    // Pass 1: earmarked for an installment.
    const leftovers: { e: LedgerEntryLite; amount: number }[] = [];
    for (const c of credits) {
      const target = c.e.installmentId ? curItems.find((i) => i.id === c.e.installmentId) : undefined;
      if (!target) {
        leftovers.push(c);
        continue;
      }
      const left = apply(c.amount, [target]);
      if (left > 0) leftovers.push({ e: c.e, amount: left });
    }
    // Pass 2: earmarked for a plan.
    let pool = 0;
    for (const c of leftovers) {
      const pid = c.e.paymentId;
      const planItems = pid ? curItems.filter((i) => i.paymentId === pid) : [];
      pool += planItems.length ? apply(c.amount, planItems) : c.amount;
    }
    // Pass 3: oldest outstanding first, any plan.
    let credit = apply(pool, curItems);

    // Debits: use credit first, then reopen the latest-due covered items.
    let debit = debitTotal;
    const fromCredit = Math.min(credit, debit);
    credit -= fromCredit;
    debit -= fromCredit;
    for (const t of [...curItems].reverse()) {
      if (debit <= 0) break;
      const a = applied.get(t.id) ?? 0;
      if (a <= 0) continue;
      const take = Math.min(a, debit);
      applied.set(t.id, a - take);
      debit -= take;
    }
    const unallocatedDebt = debit;

    const itemsTotal = curItems.reduce((s, i) => s + i.amountCents, 0);
    const outstanding = curItems.reduce((s, i) => s + Math.max(0, remaining(i)), 0) + unallocatedDebt;
    const overdue = curItems
      .filter((i) => remaining(i) > 0 && i.dueDate !== null && i.dueDate < today)
      .reduce((s, i) => s + remaining(i), 0);

    totals.push({
      currency: cur,
      billedCents: itemsTotal + charges,
      paidCents: payments - refunds,
      discountCents: discounts,
      refundCents: refunds,
      outstandingCents: outstanding,
      creditCents: credit,
      overdueCents: overdue,
    });
  }

  const allocations: ItemAllocation[] = sorted.map((item) => {
    const a = applied.get(item.id) ?? 0;
    const remaining = Math.max(0, item.amountCents - a);
    return {
      item,
      appliedCents: a,
      remainingCents: remaining,
      status: remaining === 0 ? "paid" : a > 0 ? "partial" : "pending",
      overdue: remaining > 0 && item.dueDate !== null && item.dueDate < today,
    };
  });

  totals.sort((a, b) => b.outstandingCents - a.outstandingCents || b.billedCents - a.billedCents || a.currency.localeCompare(b.currency));
  const empty: CurrencyTotals = {
    currency: "usd", billedCents: 0, paidCents: 0, discountCents: 0, refundCents: 0, outstandingCents: 0, creditCents: 0, overdueCents: 0,
  };
  const primary = totals[0] ?? empty;
  const anyOutstanding = totals.some((t) => t.outstandingCents > 0);
  const anyCredit = totals.some((t) => t.paidCents > 0 || t.discountCents > 0);
  const isOverdue = allocations.some((a) => a.overdue);
  const paymentStatus: Statement["paymentStatus"] = !anyOutstanding ? "paid" : anyCredit ? "partial" : "owing";
  const status: BalanceStatus = !anyOutstanding ? "paid" : isOverdue ? "overdue" : paymentStatus;

  const firstOpen = allocations.find((a) => a.remainingCents > 0);
  const lastPaymentOn = live
    .filter((e) => e.kind === "payment")
    .reduce<string | null>((m, e) => (!m || e.paidOn > m ? e.paidOn : m), null);

  return {
    items: allocations,
    totals,
    primaryCurrency: primary.currency,
    primary,
    status,
    paymentStatus,
    isOverdue,
    nextDue: firstOpen
      ? { dueDate: firstOpen.item.dueDate, amountCents: firstOpen.remainingCents, currency: firstOpen.item.currency, itemId: firstOpen.item.id }
      : null,
    lastPaymentOn,
    outstandingItemCount: allocations.filter((a) => a.remainingCents > 0).length,
  };
}

// ─── Recording a payment ────────────────────────────────────────────────────

export interface PaymentCheck {
  ok: boolean;
  error?: string;
  /** Outstanding in the payment's currency before it is recorded. */
  outstandingCents: number;
  /** How much of the payment would become credit. */
  creditCents: number;
}

/**
 * Overpayment policy: a payment larger than everything still owed in that
 * currency is refused with a clear message, unless the admin explicitly asks
 * to keep the extra as credit (it is then applied automatically to the next
 * thing billed in that currency). Partial payments are always fine.
 */
export function checkPayment(
  statement: Statement,
  amountCents: number,
  currency: string,
  allowCredit: boolean
): PaymentCheck {
  const cur = normCurrency(currency);
  const t = statement.totals.find((x) => x.currency === cur);
  const outstanding = t?.outstandingCents ?? 0;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero.", outstandingCents: outstanding, creditCents: 0 };
  }
  const extra = Math.max(0, amountCents - outstanding);
  if (extra > 0 && !allowCredit) {
    return {
      ok: false,
      error:
        outstanding === 0
          ? `Nothing is owed in ${cur.toUpperCase()}. To keep this ${formatMoney(amountCents, cur)} as credit for future charges, tick "Keep the extra as credit".`
          : `This payment is ${formatMoney(extra, cur)} more than the outstanding balance of ${formatMoney(outstanding, cur)}. Enter ${formatMoney(outstanding, cur)} or less, or tick "Keep the extra as credit".`,
      outstandingCents: outstanding,
      creditCents: extra,
    };
  }
  return { ok: true, outstandingCents: outstanding, creditCents: extra };
}

/** A refund can't return more than the cash collected in that currency. */
export function checkRefund(statement: Statement, amountCents: number, currency: string): string | null {
  const cur = normCurrency(currency);
  const paid = statement.totals.find((x) => x.currency === cur)?.paidCents ?? 0;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return "Enter an amount greater than zero.";
  if (amountCents > paid) return `You can refund at most ${formatMoney(paid, cur)}, the amount collected so far.`;
  return null;
}

/** A discount/waiver can't take the student below zero owed in that currency. */
export function checkReduction(statement: Statement, amountCents: number, currency: string): string | null {
  const cur = normCurrency(currency);
  const outstanding = statement.totals.find((x) => x.currency === cur)?.outstandingCents ?? 0;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return "Enter an amount greater than zero.";
  if (amountCents > outstanding) return `That is more than the ${formatMoney(outstanding, cur)} still owed. Enter ${formatMoney(outstanding, cur)} or less.`;
  return null;
}

/** How a new (or existing) entry was applied: allocation diff with vs without it. */
export function allocationDiff(before: Statement, after: Statement): { itemId: string; deltaCents: number }[] {
  const prev = new Map(before.items.map((a) => [a.item.id, a.appliedCents]));
  return after.items
    .map((a) => ({ itemId: a.item.id, deltaCents: a.appliedCents - (prev.get(a.item.id) ?? 0) }))
    .filter((d) => d.deltaCents !== 0);
}

/**
 * Status writes needed to keep tuition_installments / tuition_payments in step
 * with the ledger. An installment is only moved DOWN (paid → partial/pending)
 * when `allowDowngradeIds` contains it — i.e. when the change being made (a
 * void or refund) is what reduced it — so a row marked paid by some path that
 * did not write the ledger is never silently reopened.
 */
export function statusUpdates(
  statement: Statement,
  allowDowngradeIds: Set<string> = new Set()
): {
  installments: { id: string; status: "paid" | "partial" | "pending" }[];
  payments: { id: string; status: "paid" | "partial" | "pending" }[];
} {
  const rank = { pending: 0, failed: 0, partial: 1, paid: 2 } as Record<string, number>;
  const installments: { id: string; status: "paid" | "partial" | "pending" }[] = [];
  const finalStatus = new Map<string, string>();
  for (const a of statement.items) {
    const stored = a.item.storedStatus ?? "pending";
    let next: string = a.status;
    if (rank[next] < (rank[stored] ?? 0) && !allowDowngradeIds.has(a.item.id)) next = stored;
    // Nothing received on a failed (card) attempt: keep the provider's "failed".
    if (next === "pending" && stored === "failed") next = stored;
    finalStatus.set(a.item.id, next);
    if (a.item.id.startsWith("payment:")) continue;
    if (next !== stored && (next === "paid" || next === "partial" || next === "pending")) {
      installments.push({ id: a.item.id, status: next });
    }
  }
  const byPayment = new Map<string, string[]>();
  for (const a of statement.items) {
    const list = byPayment.get(a.item.paymentId) ?? [];
    list.push(finalStatus.get(a.item.id) ?? a.status);
    byPayment.set(a.item.paymentId, list);
  }
  const payments: { id: string; status: "paid" | "partial" | "pending" }[] = [];
  for (const [id, sts] of byPayment) {
    const status = sts.every((s) => s === "paid") ? "paid" : sts.some((s) => s === "paid" || s === "partial") ? "partial" : "pending";
    payments.push({ id, status });
  }
  return { installments, payments };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatMoney(cents: number, currency: string): string {
  const cur = normCurrency(currency).toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-01" → "1 Dec 2026" (date-only, no timezone shift). */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function receiptNumberFor(id: string, paidOn: string): string {
  return `R-${paidOn.replace(/-/g, "").slice(0, 8)}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

// ─── Reminders ──────────────────────────────────────────────────────────────

export const REMINDER_NOTE_MAX = 500;
export const REMINDER_THROTTLE_HOURS = 24;

/** Trim, normalise whitespace and cap the admin's optional note. */
export function cleanNote(note: unknown, max = REMINDER_NOTE_MAX): string {
  if (typeof note !== "string") return "";
  // Strip control characters except newlines, collapse runs of blank lines.
  const s = note.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

export interface ReminderItemLine {
  planLabel: string;
  installmentNumber: number;
  installmentCount: number;
  remainingCents: number;
  currency: string;
  dueDate: string | null;
  overdue: boolean;
}

export interface ReminderContent {
  subject: string;
  /** The opening sentence(s), plain text. */
  summary: string;
  lines: ReminderItemLine[];
  /** One "Total due" string per currency. */
  totals: { currency: string; outstandingCents: number; label: string }[];
  /** Full plain-text message (in-app notification body and text email). */
  text: string;
  linkLabel: string;
  linkPath: string;
}

export function itemLineText(l: ReminderItemLine, today: string): string {
  const part = l.installmentCount > 1 ? `${l.planLabel}, installment ${l.installmentNumber} of ${l.installmentCount}` : l.planLabel;
  const due = l.dueDate ? ` (${l.overdue || l.dueDate < today ? "was due" : "due"} ${formatDay(l.dueDate)}${l.overdue ? ", overdue" : ""})` : "";
  return `${part}: ${formatMoney(l.remainingCents, l.currency)}${due}`;
}

export function buildReminder(input: {
  firstName: string;
  schoolName: string;
  statement: Statement;
  onlinePayments: boolean;
  paymentInstructions?: string | null;
  note?: string | null;
  today?: string;
  /** Set when writing to a parent/guardian: whose balance this is. */
  childName?: string | null;
}): ReminderContent {
  const today = input.today ?? todayUtc();
  const st = input.statement;
  const open = st.items.filter((a) => a.remainingCents > 0);
  const lines: ReminderItemLine[] = open.map((a) => ({
    planLabel: a.item.planLabel,
    installmentNumber: a.item.installmentNumber,
    installmentCount: a.item.installmentCount,
    remainingCents: a.remainingCents,
    currency: a.item.currency,
    dueDate: a.item.dueDate,
    overdue: a.overdue,
  }));
  const owed = st.totals.filter((t) => t.outstandingCents > 0);
  const totals = owed.map((t) => ({ currency: t.currency, outstandingCents: t.outstandingCents, label: formatMoney(t.outstandingCents, t.currency) }));
  const plans = Array.from(new Set(open.map((a) => a.item.planLabel)));
  const name = input.firstName.trim() || "there";
  const count = open.length;
  const amount = joinList(totals.map((t) => t.label)) || formatMoney(0, st.primaryCurrency);
  const forPlans = plans.length ? ` for ${joinList(plans)}` : "";
  const whose = input.childName?.trim() ? `${input.childName.trim()}'s` : "your";
  let summary = `Hi ${name}, ${whose} balance${forPlans} is ${amount}${count ? ` (${count} ${count === 1 ? "installment" : "installments"})` : ""}.`;
  if (st.nextDue) {
    const verb = st.nextDue.dueDate && st.nextDue.dueDate < today ? "was due on" : "is due on";
    summary += st.nextDue.dueDate
      ? ` Next payment of ${formatMoney(st.nextDue.amountCents, st.nextDue.currency)} ${verb} ${formatDay(st.nextDue.dueDate)}.`
      : ` Next payment: ${formatMoney(st.nextDue.amountCents, st.nextDue.currency)}.`;
  }
  const overdueTotals = st.totals.filter((t) => t.overdueCents > 0).map((t) => formatMoney(t.overdueCents, t.currency));
  if (overdueTotals.length) summary += ` ${joinList(overdueTotals)} ${overdueTotals.length === 1 ? "is" : "are"} overdue.`;

  const linkLabel = input.onlinePayments ? "View and pay" : "View balance";
  const linkPath = "/dashboard/student/tuition";
  const note = cleanNote(input.note);
  const instructions = (input.paymentInstructions ?? "").trim();

  const parts = [summary, "", "Outstanding:"];
  for (const l of lines) parts.push(`• ${itemLineText(l, today)}`);
  for (const t of totals) parts.push(`Total due: ${t.label}`);
  if (note) parts.push("", `A note from ${input.schoolName}: ${note}`);
  if (!input.onlinePayments && instructions) parts.push("", "How to pay:", instructions);
  parts.push("", `${linkLabel}: ${linkPath}`);

  return {
    subject: `${input.schoolName}: ${whose} tuition balance is ${amount}`,
    summary,
    lines,
    totals,
    text: parts.join("\n"),
    linkLabel,
    linkPath,
  };
}

/** Split students into those to remind now and those reminded too recently. */
export function partitionByThrottle(
  studentIds: string[],
  lastRemindedAt: Map<string, string>,
  opts: { now?: Date; override?: boolean; hours?: number } = {}
): { send: string[]; skipped: string[] } {
  const now = (opts.now ?? new Date()).getTime();
  const windowMs = (opts.hours ?? REMINDER_THROTTLE_HOURS) * 3600_000;
  const send: string[] = [];
  const skipped: string[] = [];
  for (const id of studentIds) {
    const last = lastRemindedAt.get(id);
    if (!opts.override && last && now - new Date(last).getTime() < windowMs) skipped.push(id);
    else send.push(id);
  }
  return { send, skipped };
}

// ─── Balance list filters ───────────────────────────────────────────────────

export interface BalanceRowLite {
  studentName: string;
  studentEmail: string | null;
  status: BalanceStatus;
  isOverdue: boolean;
  balanceCents: number;
  nextDueDate: string | null;
  programIds: string[];
  courseIds: string[];
}

export interface BalanceFilter {
  status?: string;
  programId?: string;
  courseId?: string;
  overdue?: boolean;
  minOwedCents?: number;
  maxOwedCents?: number;
  q?: string;
  sort?: "balance_desc" | "balance_asc" | "due_asc" | "due_desc" | "name";
}

export function filterAndSortRows<T extends BalanceRowLite>(rows: T[], f: BalanceFilter): T[] {
  const q = (f.q ?? "").trim().toLowerCase();
  let out = rows.filter((r) => {
    if (f.status && f.status !== "all" && r.status !== f.status) return false;
    if (f.overdue && !r.isOverdue) return false;
    if (f.programId && !r.programIds.includes(f.programId)) return false;
    if (f.courseId && !r.courseIds.includes(f.courseId)) return false;
    if (typeof f.minOwedCents === "number" && r.balanceCents < f.minOwedCents) return false;
    if (typeof f.maxOwedCents === "number" && r.balanceCents > f.maxOwedCents) return false;
    if (q && !`${r.studentName} ${r.studentEmail ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const due = (r: T, dir: 1 | -1) => (r.nextDueDate ? r.nextDueDate : dir === 1 ? "9999-12-31" : "0000-01-01");
  switch (f.sort) {
    case "balance_asc":
      out = out.sort((a, b) => a.balanceCents - b.balanceCents || a.studentName.localeCompare(b.studentName));
      break;
    case "due_asc":
      out = out.sort((a, b) => due(a, 1).localeCompare(due(b, 1)) || b.balanceCents - a.balanceCents);
      break;
    case "due_desc":
      out = out.sort((a, b) => due(b, -1).localeCompare(due(a, -1)) || b.balanceCents - a.balanceCents);
      break;
    case "name":
      out = out.sort((a, b) => a.studentName.localeCompare(b.studentName));
      break;
    default:
      out = out.sort((a, b) => b.balanceCents - a.balanceCents || a.studentName.localeCompare(b.studentName));
  }
  return out;
}

// ─── Pre-ledger balance (used to prove the backfill keeps balances) ─────────

/** Balance as the app computed it before the ledger: sum of paid installments. */
export function legacyPaidCents(
  payment: { amountCents: number; status: string },
  installments: { amountCents: number; status: string }[]
): number {
  if (!installments.length) return payment.status === "paid" ? payment.amountCents : 0;
  return installments.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formulas: a
 * text cell starting with = + - @ (e.g. a student named "=HYPERLINK(...)")
 * gets a leading apostrophe. Plain numbers such as "-12.50" are left alone.
 */
export function toCsvCell(cell: string | number | null | undefined): string {
  let s = cell === null || cell === undefined ? "" : String(cell);
  if (typeof cell === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
