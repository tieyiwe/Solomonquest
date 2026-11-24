import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { isStripeConfigured } from "./stripe";
import {
  allocationDiff,
  computeStatement,
  normCurrency,
  receiptNumberFor,
  statusUpdates,
  todayUtc,
  type BillItem,
  type LedgerEntryLite,
  type LedgerKind,
  type Statement,
} from "./tuitionLedgerCore";

/**
 * Database side of the tuition ledger. The arithmetic lives in
 * tuitionLedgerCore.ts; this file loads the rows, writes ledger entries and
 * keeps the installment/payment status columns in step.
 *
 * Every path that takes money for tuition (an admin recording a payment, the
 * Stripe webhook, the test-only simulate-pay route) must call
 * recordLedgerEntry(), or the computed balance won't include it.
 */

const ID_CHUNK = 200;

export class LedgerUnavailableError extends Error {
  constructor() {
    super("The tuition ledger isn't set up yet. Run tuition-ledger.sql in the Supabase SQL editor.");
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isMissingRelation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || err.code === "42703" || /does not exist|schema cache/i.test(err.message ?? "");
}

export interface LedgerRow {
  id: string;
  school_id: string;
  student_id: string;
  payment_id: string | null;
  installment_id: string | null;
  amount_cents: number;
  currency: string;
  kind: LedgerKind;
  method: string | null;
  reference: string | null;
  note: string | null;
  label: string | null;
  paid_on: string;
  receipt_number: string | null;
  source: string;
  recorded_by: string | null;
  recorded_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export function toLite(r: LedgerRow): LedgerEntryLite {
  return {
    id: r.id,
    paymentId: r.payment_id,
    installmentId: r.installment_id,
    amountCents: r.amount_cents,
    currency: normCurrency(r.currency),
    kind: r.kind,
    paidOn: r.paid_on,
    recordedAt: r.recorded_at,
    voidedAt: r.voided_at,
  };
}

export function mapLedgerRow(r: LedgerRow, names?: Map<string, string>) {
  return {
    id: r.id,
    schoolId: r.school_id,
    studentId: r.student_id,
    paymentId: r.payment_id,
    installmentId: r.installment_id,
    amountCents: r.amount_cents,
    currency: normCurrency(r.currency),
    kind: r.kind,
    method: r.method,
    reference: r.reference,
    note: r.note,
    label: r.label,
    paidOn: r.paid_on,
    receiptNumber: r.receipt_number,
    source: r.source,
    recordedBy: r.recorded_by,
    recordedByName: r.recorded_by ? names?.get(r.recorded_by) ?? null : null,
    recordedAt: r.recorded_at,
    voidedAt: r.voided_at,
    voidedBy: r.voided_by,
    voidedByName: r.voided_by ? names?.get(r.voided_by) ?? null : null,
    voidReason: r.void_reason,
  };
}

export interface StudentLedger {
  studentId: string;
  items: BillItem[];
  entries: LedgerRow[];
  statement: Statement;
  /** True when the ledger table is missing and balances come from installment statuses. */
  legacy: boolean;
}

interface PaymentRow {
  id: string;
  student_id: string;
  school_id: string;
  tuition_plan_id: string | null;
  course_id: string | null;
  program_id: string | null;
  amount_cents: number;
  currency: string | null;
  payment_method: string | null;
  installment_count: number | null;
  status: string;
  created_at: string;
}

interface InstallmentRow {
  id: string;
  payment_id: string;
  installment_number: number;
  amount_cents: number;
  due_date: string | null;
  status: string;
  paid_at: string | null;
}

/**
 * Load billing + ledger for one school (optionally limited to some students)
 * and compute each student's statement.
 */
export async function loadStudentLedgers(
  schoolId: string,
  opts: { studentIds?: string[]; today?: string } = {}
): Promise<Map<string, StudentLedger>> {
  const today = opts.today ?? todayUtc();
  let payments: PaymentRow[] = [];
  if (opts.studentIds) {
    for (const part of chunk(Array.from(new Set(opts.studentIds)), ID_CHUNK)) {
      const { data, error } = await supabaseAdmin
        .from("tuition_payments")
        .select("id, student_id, school_id, tuition_plan_id, course_id, program_id, amount_cents, currency, payment_method, installment_count, status, created_at")
        .eq("school_id", schoolId)
        .in("student_id", part);
      if (error) throw new Error(error.message);
      payments.push(...((data ?? []) as PaymentRow[]));
    }
  } else {
    const { data, error } = await supabaseAdmin
      .from("tuition_payments")
      .select("id, student_id, school_id, tuition_plan_id, course_id, program_id, amount_cents, currency, payment_method, installment_count, status, created_at")
      .eq("school_id", schoolId);
    if (error) throw new Error(error.message);
    payments = (data ?? []) as PaymentRow[];
  }
  payments = payments.filter((p) => p.status !== "failed");

  const installments: InstallmentRow[] = [];
  for (const part of chunk(payments.map((p) => p.id), ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("tuition_installments")
      .select("id, payment_id, installment_number, amount_cents, due_date, status, paid_at")
      .in("payment_id", part);
    if (error) throw new Error(error.message);
    installments.push(...((data ?? []) as InstallmentRow[]));
  }

  // Ledger rows. A missing table (migration not run yet) falls back to the
  // pre-ledger meaning: an installment marked paid is fully covered.
  let entries: LedgerRow[] = [];
  let legacy = false;
  {
    let q = supabaseAdmin.from("tuition_ledger_entries").select("*").eq("school_id", schoolId);
    if (opts.studentIds) q = q.in("student_id", Array.from(new Set(opts.studentIds)).slice(0, 1000));
    const { data, error } = await q.order("recorded_at", { ascending: true });
    if (error) {
      if (!isMissingRelation(error)) throw new Error(error.message);
      legacy = true;
    } else {
      entries = (data ?? []) as LedgerRow[];
    }
  }

  // Plan names.
  const courseIds = Array.from(new Set(payments.map((p) => p.course_id).filter(Boolean) as string[]));
  const programIds = Array.from(new Set(payments.map((p) => p.program_id).filter(Boolean) as string[]));
  const titles = new Map<string, string>();
  for (const part of chunk(courseIds, ID_CHUNK)) {
    const { data } = await supabaseAdmin.from("courses").select("id, title").in("id", part);
    for (const c of data ?? []) titles.set(c.id as string, (c.title as string) || "Course");
  }
  for (const part of chunk(programIds, ID_CHUNK)) {
    const { data } = await supabaseAdmin.from("programs").select("id, name").in("id", part);
    for (const p of data ?? []) titles.set(p.id as string, (p.name as string) || "Program");
  }

  const instByPayment = new Map<string, InstallmentRow[]>();
  for (const i of installments) {
    const list = instByPayment.get(i.payment_id) ?? [];
    list.push(i);
    instByPayment.set(i.payment_id, list);
  }

  const itemsByStudent = new Map<string, BillItem[]>();
  const legacyEntries = new Map<string, LedgerRow[]>();
  for (const p of payments) {
    const planLabel = titles.get((p.program_id ?? p.course_id) as string) ?? "Tuition";
    const list = itemsByStudent.get(p.student_id) ?? [];
    const insts = (instByPayment.get(p.id) ?? []).sort((a, b) => a.installment_number - b.installment_number);
    const count = insts.length || 1;
    if (insts.length === 0) {
      list.push({
        id: `payment:${p.id}`, paymentId: p.id, installmentNumber: 1, installmentCount: 1, amountCents: p.amount_cents,
        dueDate: p.created_at ? p.created_at.slice(0, 10) : null, currency: normCurrency(p.currency), planLabel,
        programId: p.program_id, courseId: p.course_id, storedStatus: p.status === "paid" ? "paid" : "pending", paymentCreatedAt: p.created_at,
      });
      if (legacy && p.status === "paid") {
        const l = legacyEntries.get(p.student_id) ?? [];
        l.push(syntheticRow(p, null, p.amount_cents, p.created_at));
        legacyEntries.set(p.student_id, l);
      }
    }
    for (const i of insts) {
      list.push({
        id: i.id, paymentId: p.id, installmentNumber: i.installment_number, installmentCount: count, amountCents: i.amount_cents,
        dueDate: i.due_date, currency: normCurrency(p.currency), planLabel, programId: p.program_id, courseId: p.course_id,
        storedStatus: i.status, paymentCreatedAt: p.created_at,
      });
      if (legacy && i.status === "paid") {
        const l = legacyEntries.get(p.student_id) ?? [];
        l.push(syntheticRow(p, i.id, i.amount_cents, i.paid_at ?? p.created_at));
        legacyEntries.set(p.student_id, l);
      }
    }
    itemsByStudent.set(p.student_id, list);
  }

  const entriesByStudent = new Map<string, LedgerRow[]>();
  for (const e of legacy ? Array.from(legacyEntries.values()).flat() : entries) {
    const list = entriesByStudent.get(e.student_id) ?? [];
    list.push(e);
    entriesByStudent.set(e.student_id, list);
  }

  const out = new Map<string, StudentLedger>();
  const ids = new Set<string>([...itemsByStudent.keys(), ...entriesByStudent.keys()]);
  for (const sid of ids) {
    if (opts.studentIds && !opts.studentIds.includes(sid)) continue;
    const items = itemsByStudent.get(sid) ?? [];
    const rows = entriesByStudent.get(sid) ?? [];
    out.set(sid, { studentId: sid, items, entries: rows, statement: computeStatement(items, rows.map(toLite), { today }), legacy });
  }
  return out;
}

function syntheticRow(p: PaymentRow, installmentId: string | null, amount: number, at: string): LedgerRow {
  return {
    id: `legacy-${installmentId ?? p.id}`, school_id: p.school_id, student_id: p.student_id, payment_id: p.id, installment_id: installmentId,
    amount_cents: amount, currency: normCurrency(p.currency), kind: "payment", method: "other", reference: null, note: null, label: null,
    paid_on: at.slice(0, 10), receipt_number: null, source: "backfill", recorded_by: null, recorded_at: at, voided_at: null, voided_by: null, void_reason: null,
  };
}

export async function loadStudentLedger(schoolId: string, studentId: string): Promise<StudentLedger> {
  const map = await loadStudentLedgers(schoolId, { studentIds: [studentId] });
  return (
    map.get(studentId) ?? {
      studentId,
      items: [],
      entries: [],
      statement: computeStatement([], []),
      legacy: false,
    }
  );
}

export interface RecordLedgerInput {
  schoolId: string;
  studentId: string;
  kind: LedgerKind;
  amountCents: number;
  currency?: string | null;
  paymentId?: string | null;
  installmentId?: string | null;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  label?: string | null;
  paidOn?: string | null;
  source?: "manual" | "stripe" | "simulated" | "backfill";
  recordedBy?: string | null;
}

/**
 * Insert one ledger row and bring the installment/payment status columns in
 * line with the new balance. Idempotent for Stripe: a second call with the
 * same Stripe reference returns the existing row instead of inserting.
 */
export async function recordLedgerEntry(input: RecordLedgerInput): Promise<LedgerRow> {
  const id = randomUUID();
  const paidOn = input.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) ? input.paidOn : todayUtc();
  const kind = input.kind;

  if (input.source === "stripe" && input.reference) {
    const { data: existing, error } = await supabaseAdmin
      .from("tuition_ledger_entries")
      .select("*")
      .eq("source", "stripe")
      .eq("reference", input.reference)
      .maybeSingle();
    if (error && isMissingRelation(error)) throw new LedgerUnavailableError();
    if (existing) return existing as LedgerRow;
  }

  const row = {
    id,
    school_id: input.schoolId,
    student_id: input.studentId,
    payment_id: input.paymentId ?? null,
    installment_id: input.installmentId ?? null,
    amount_cents: input.amountCents,
    currency: normCurrency(input.currency),
    kind,
    method: input.method ?? null,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    label: input.label?.trim() || null,
    paid_on: paidOn,
    receipt_number: kind === "payment" || kind === "refund" ? receiptNumberFor(id, paidOn) : null,
    source: input.source ?? "manual",
    recorded_by: input.recordedBy ?? null,
  };

  const { data, error } = await supabaseAdmin.from("tuition_ledger_entries").insert(row).select().single();
  if (error || !data) {
    if (isMissingRelation(error)) throw new LedgerUnavailableError();
    throw new Error(error?.message ?? "Failed to record the entry");
  }

  // Refunds and charges can reopen installments; let them.
  const reduces = kind === "refund" || (kind === "adjustment" && input.amountCents < 0);
  await syncStudentStatuses(input.schoolId, input.studentId, { downgradeFor: reduces ? { entryId: id, removed: false } : undefined, paidOn });
  return data as LedgerRow;
}

/**
 * Recompute a student's allocation and write installment/payment statuses
 * that changed. Downgrades (paid → partial/pending) are only written for the
 * installments the given entry change affected.
 */
export async function syncStudentStatuses(
  schoolId: string,
  studentId: string,
  opts: { downgradeFor?: { entryId: string; removed: boolean }; paidOn?: string } = {}
): Promise<void> {
  try {
    const ledger = await loadStudentLedger(schoolId, studentId);
    if (ledger.legacy) return;
    const allow = new Set<string>();
    if (opts.downgradeFor) {
      const lites = ledger.entries.map(toLite);
      const without = computeStatement(ledger.items, lites.filter((e) => e.id !== opts.downgradeFor!.entryId));
      const withIt = computeStatement(
        ledger.items,
        lites.map((e) => (e.id === opts.downgradeFor!.entryId ? { ...e, voidedAt: null } : e))
      );
      // A void: the entry used to count (withIt) and now doesn't (without).
      // A new debit: it didn't count before (without) and does now (withIt).
      const diff = opts.downgradeFor.removed ? allocationDiff(withIt, without) : allocationDiff(without, withIt);
      for (const d of diff) if (d.deltaCents < 0) allow.add(d.itemId);
    }
    const { installments, payments } = statusUpdates(ledger.statement, allow);
    const paidAt = opts.paidOn ? `${opts.paidOn}T12:00:00.000Z` : new Date().toISOString();
    for (const u of installments) {
      await supabaseAdmin
        .from("tuition_installments")
        .update({ status: u.status, paid_at: u.status === "paid" ? paidAt : null })
        .eq("id", u.id);
    }
    const ids = Array.from(new Set(ledger.items.map((i) => i.paymentId)));
    if (ids.length) {
      const { data: current } = await supabaseAdmin.from("tuition_payments").select("id, status").in("id", ids);
      const now = new Date().toISOString();
      for (const p of payments) {
        const cur = (current ?? []).find((c) => c.id === p.id);
        if (cur && cur.status !== p.status && cur.status !== "failed") {
          await supabaseAdmin.from("tuition_payments").update({ status: p.status, updated_at: now }).eq("id", p.id);
        }
      }
    }
  } catch (err) {
    logger.error({ err, studentId }, "tuition ledger: status sync failed");
  }
}

export async function voidLedgerEntry(
  schoolId: string,
  entryId: string,
  reason: string,
  voidedBy: string | null
): Promise<LedgerRow | null> {
  const { data, error } = await supabaseAdmin
    .from("tuition_ledger_entries")
    .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
    .eq("id", entryId)
    .eq("school_id", schoolId)
    .is("voided_at", null)
    .select()
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) throw new LedgerUnavailableError();
    throw new Error(error.message);
  }
  if (!data) return null;
  const row = data as LedgerRow;
  // Voiding a credit can reopen installments; voiding a debit only closes them.
  await syncStudentStatuses(schoolId, row.student_id, { downgradeFor: { entryId: row.id, removed: true } });
  return row;
}

export async function getLedgerRow(entryId: string): Promise<LedgerRow | null> {
  const { data, error } = await supabaseAdmin.from("tuition_ledger_entries").select("*").eq("id", entryId).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) throw new LedgerUnavailableError();
    throw new Error(error.message);
  }
  return (data as LedgerRow) ?? null;
}

/** Most recent reminder per student, from tuition_reminders. */
export async function lastRemindedMap(schoolId: string, studentIds?: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let q = supabaseAdmin.from("tuition_reminders").select("student_id, sent_at").eq("school_id", schoolId);
  if (studentIds) q = q.in("student_id", studentIds.slice(0, 1000));
  const { data, error } = await q.order("sent_at", { ascending: false }).limit(5000);
  if (error) {
    if (!isMissingRelation(error)) logger.warn({ err: error }, "tuition ledger: reminder history lookup failed");
    return out;
  }
  for (const r of data ?? []) {
    const sid = r.student_id as string;
    if (!out.has(sid)) out.set(sid, r.sent_at as string);
  }
  return out;
}

export interface SchoolPaymentInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  paymentInstructions: string | null;
  onlinePayments: boolean;
}

export async function getSchoolPaymentInfo(schoolId: string): Promise<SchoolPaymentInfo> {
  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("id, name, logo_url, payment_instructions, stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", schoolId)
    .maybeSingle();
  let row = data as Record<string, unknown> | null;
  if (error) {
    // Columns from a migration that hasn't been run: retry with the basics.
    const { data: basic } = await supabaseAdmin.from("schools").select("id, name, logo_url").eq("id", schoolId).maybeSingle();
    row = basic as Record<string, unknown> | null;
  }
  return {
    id: schoolId,
    name: (row?.name as string) || "Your school",
    logoUrl: (row?.logo_url as string) || null,
    paymentInstructions: (row?.payment_instructions as string) || null,
    onlinePayments: Boolean(isStripeConfigured() && row?.stripe_connect_account_id && row?.stripe_connect_charges_enabled),
  };
}

export async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunk(Array.from(new Set(ids.filter(Boolean))), ID_CHUNK)) {
    const { data } = await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", part);
    for (const p of data ?? []) out.set(p.id as string, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown");
  }
  return out;
}

/** Map a statement + items for the API (camelCase). */
export function mapStatement(st: Statement) {
  return {
    status: st.status,
    paymentStatus: st.paymentStatus,
    isOverdue: st.isOverdue,
    primaryCurrency: st.primaryCurrency,
    totals: st.totals,
    nextDue: st.nextDue,
    lastPaymentOn: st.lastPaymentOn,
    outstandingItemCount: st.outstandingItemCount,
    items: st.items.map((a) => ({
      id: a.item.id,
      paymentId: a.item.paymentId,
      installmentId: a.item.id.startsWith("payment:") ? null : a.item.id,
      installmentNumber: a.item.installmentNumber,
      installmentCount: a.item.installmentCount,
      planLabel: a.item.planLabel,
      programId: a.item.programId ?? null,
      courseId: a.item.courseId ?? null,
      amountCents: a.item.amountCents,
      currency: a.item.currency,
      dueDate: a.item.dueDate,
      appliedCents: a.appliedCents,
      remainingCents: a.remainingCents,
      status: a.status,
      overdue: a.overdue,
    })),
  };
}

/** Non-voided and voided ledger rows dated (paid_on) within [from, to]; null if the ledger table is missing. */
export async function ledgerEntriesInRange(schoolId: string, from: string, to: string): Promise<LedgerRow[] | null> {
  const out: LedgerRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("tuition_ledger_entries")
      .select("*")
      .eq("school_id", schoolId)
      .gte("paid_on", from)
      .lte("paid_on", to)
      .order("paid_on", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (isMissingRelation(error)) return null;
      throw new Error(error.message);
    }
    out.push(...((data ?? []) as LedgerRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Tuition revenue for the P&L (cash basis, by the date money was received):
 * payments minus refunds, voided rows excluded. `rows` carries signed amounts
 * so callers can bucket them by month. Null when the ledger isn't set up.
 */
export async function tuitionRevenueForRange(schoolId: string, from: string, to: string) {
  const entries = await ledgerEntriesInRange(schoolId, from, to);
  if (!entries) return null;
  const live = entries.filter((e) => !e.voided_at);
  const rows = live
    .filter((e) => e.kind === "payment" || e.kind === "refund")
    .map((e) => ({ amountCents: e.kind === "refund" ? -Math.abs(e.amount_cents) : e.amount_cents, date: e.paid_on, currency: normCurrency(e.currency) }));
  const grossCents = live.filter((e) => e.kind === "payment").reduce((s, e) => s + e.amount_cents, 0);
  const refundsCents = live.filter((e) => e.kind === "refund").reduce((s, e) => s + e.amount_cents, 0);
  const discountsCents = live
    .filter((e) => e.kind === "discount" || e.kind === "waiver" || (e.kind === "adjustment" && e.amount_cents > 0))
    .reduce((s, e) => s + e.amount_cents, 0);
  return { rows, grossCents, refundsCents, discountsCents, netCents: grossCents - refundsCents };
}
