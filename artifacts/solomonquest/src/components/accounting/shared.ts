import { supabase } from "@/lib/supabase";

/**
 * Shared types + helpers for the tuition ledger screens (admin Accounting,
 * receipts, student/parent Tuition). Field names mirror the API's camelCase
 * mappers in api-server/src/lib/tuitionLedger.ts and tuitionBalances.ts.
 */

export async function apiFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error || `Request failed (${res.status})`) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export function money(cents: number | null | undefined, currency?: string | null): string {
  const cur = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format((cents ?? 0) / 100);
  } catch {
    return `${((cents ?? 0) / 100).toFixed(2)} ${cur}`;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-01" (or an ISO timestamp) → "1 Dec 2026", without timezone shifts for plain dates. */
export function day(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "12.50" → 1250; null when not a valid non-negative amount. */
export function toCents(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export const METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "card_in_person", label: "Card (in person)" },
  { value: "other", label: "Other" },
];
export const METHOD_LABEL: Record<string, string> = Object.fromEntries([...METHODS, { value: "online", label: "Online (card)" }].map((m) => [m.value, m.label]));

export type BalanceStatus = "paid" | "partial" | "owing" | "overdue";

export const STATUS_LABEL: Record<BalanceStatus, string> = {
  paid: "Paid in full",
  partial: "Partially paid",
  owing: "Owing",
  overdue: "Overdue",
};
export const STATUS_STYLE: Record<BalanceStatus, string> = {
  paid: "bg-success/10 text-success border-success/30",
  partial: "bg-warning/10 text-warning border-warning/30",
  owing: "bg-muted text-foreground border-border",
  overdue: "bg-destructive/10 text-destructive border-destructive/30",
};

export const KIND_LABEL: Record<string, string> = {
  payment: "Payment",
  discount: "Discount",
  waiver: "Waiver",
  refund: "Refund",
  adjustment: "Adjustment",
};

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

export interface StatementItem {
  id: string;
  paymentId: string;
  installmentId: string | null;
  installmentNumber: number;
  installmentCount: number;
  planLabel: string;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  appliedCents: number;
  remainingCents: number;
  status: "paid" | "partial" | "pending";
  overdue: boolean;
}

export interface Statement {
  status: BalanceStatus;
  paymentStatus: "paid" | "partial" | "owing";
  isOverdue: boolean;
  primaryCurrency: string;
  totals: CurrencyTotals[];
  nextDue: { dueDate: string | null; amountCents: number; currency: string; itemId: string } | null;
  lastPaymentOn: string | null;
  outstandingItemCount: number;
  items: StatementItem[];
}

export interface LedgerEntry {
  id: string;
  studentId: string;
  paymentId: string | null;
  installmentId: string | null;
  amountCents: number;
  currency: string;
  kind: "payment" | "discount" | "waiver" | "refund" | "adjustment";
  method: string | null;
  reference: string | null;
  note: string | null;
  label: string | null;
  paidOn: string;
  receiptNumber: string | null;
  source: string;
  recordedByName: string | null;
  recordedAt: string;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

export interface ReminderHistory {
  id: string;
  sentAt: string;
  sentByName: string | null;
  channels: string[];
  emailStatus: string | null;
  parentsNotified: number;
  balanceCents: number;
  overdueCents: number;
  currency: string;
  customNote: string | null;
}

export interface StatementPayload {
  student?: { id: string; name: string; email?: string | null };
  statement: Statement;
  entries: LedgerEntry[];
  plans: { paymentId: string; label: string; currency: string; amountCents: number }[];
  reminders: ReminderHistory[];
  onlinePayments: boolean;
  paymentInstructions: string | null;
  schoolName: string;
  legacy: boolean;
}

export function itemLabel(i: Pick<StatementItem, "planLabel" | "installmentNumber" | "installmentCount">): string {
  return i.installmentCount > 1 ? `${i.planLabel} · installment ${i.installmentNumber} of ${i.installmentCount}` : i.planLabel;
}

export function entryTitle(e: LedgerEntry): string {
  if (e.kind === "payment") return `Payment${e.method ? ` · ${METHOD_LABEL[e.method] ?? e.method}` : ""}`;
  if (e.kind === "refund") return `Refund${e.method ? ` · ${METHOD_LABEL[e.method] ?? e.method}` : ""}`;
  return e.label || KIND_LABEL[e.kind] || e.kind;
}

/** Signed effect on what's owed: negative lowers the balance. */
export function entryEffect(e: LedgerEntry): number {
  if (e.kind === "refund") return Math.abs(e.amountCents);
  if (e.kind === "adjustment") return -e.amountCents;
  return -Math.abs(e.amountCents);
}
