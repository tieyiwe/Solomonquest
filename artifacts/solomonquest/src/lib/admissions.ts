import { supabase } from "@/lib/supabase";

/**
 * Shapes and helpers for program pricing, the application fee and the
 * admission (congratulations) email. Mirrors routes/admissions.ts and the
 * fee fields routes/applications.ts adds (camelCase over the wire).
 */

export const CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "nzd", "zar", "ngn", "kes", "ghs", "inr", "sgd"] as const;

export interface ProgramPrice {
  amountCents: number;
  currency: string;
  allowFullPayment: boolean;
  allowInstallments: boolean;
  installmentCount: number;
  pricingNote: string | null;
}

export interface FeeInfo {
  required: boolean;
  amountCents: number;
  currency: string;
}

export interface PublicProgram {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  level: string | null;
  price: ProgramPrice | null;
  applicationFee: FeeInfo;
}

export interface PublicAdmissions {
  applicationFee: FeeInfo;
  programs: PublicProgram[];
}

export type FeeStatus = "not_required" | "awaiting_payment" | "paid" | "waived";

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
  startDate: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  extraLinks: ExtraLink[];
}

export interface ApplicationSummary {
  id: string;
  status: string;
  createdAt: string;
  schoolId: string;
  schoolName: string | null;
  schoolSlug: string | null;
  schoolLogoUrl: string | null;
  programId: string | null;
  programName: string | null;
  price: ProgramPrice | null;
  courses: { id: string; title: string }[];
  fee: { status: FeeStatus; amountCents: number | null; currency: string | null; paidAt: string | null; waivedAt: string | null };
  feeWaivedBy?: string | null;
  feeWaiverReason?: string | null;
  congratsEmail?: { status: "sent" | "failed" | null; sentAt: string | null; error: string | null };
}

export function formatMoney(cents: number, currency?: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${(currency || "").toUpperCase()}`;
  }
}

/** "Free" for no plan or 0, otherwise the formatted amount. */
export function priceLabel(price: ProgramPrice | null | undefined): string {
  if (!price || !(price.amountCents > 0)) return "Free";
  return formatMoney(price.amountCents, price.currency);
}

/** "or 3 installments of $1,500.00" style hint, when installments are offered. */
export function installmentHint(price: ProgramPrice | null | undefined): string | null {
  if (!price || !(price.amountCents > 0) || !price.allowInstallments || price.installmentCount < 2) return null;
  const each = Math.ceil(price.amountCents / price.installmentCount);
  return `${price.allowFullPayment ? "or " : ""}${price.installmentCount} installments of about ${formatMoney(each, price.currency)}`;
}

export const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  not_required: "No fee",
  awaiting_payment: "Awaiting payment",
  paid: "Fee paid",
  waived: "Fee waived",
};

export class ApiError extends Error {
  status: number;
  code?: string;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error ?? `Request failed (${status})`));
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : undefined;
    this.body = body;
  }
}

/** JSON call to /api that keeps the server's error code (e.g. fee_unpaid, stripe_not_ready). */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body as Record<string, unknown>);
  return body as T;
}

/** Public: no session needed. */
export async function fetchPublicAdmissions(schoolId: string): Promise<PublicAdmissions | null> {
  try {
    const res = await fetch(`/api/schools/${encodeURIComponent(schoolId)}/admissions/public`);
    if (!res.ok) return null;
    return (await res.json()) as PublicAdmissions;
  } catch {
    return null;
  }
}
