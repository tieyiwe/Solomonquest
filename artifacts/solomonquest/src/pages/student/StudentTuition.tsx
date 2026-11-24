import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StudentLayout } from "@/components/layout/StudentLayout";
import PageHeader from "@/components/layout/PageHeader";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CreditCard, Loader2, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { BalanceSummary, PaymentHistory, PaymentInstructions } from "@/components/accounting/TuitionStatementView";
import type { StatementPayload } from "@/components/accounting/shared";

// Shape of GET /tuition-payments/me (mapPayment in routes/tuition.ts).
interface Installment {
  id: string;
  installmentNumber: number;
  amountCents: number;
  dueDate: string | null;
  status: string;
  paidAt: string | null;
}
interface TuitionPayment {
  id: string;
  amountCents: number;
  currency: string | null;
  paymentMethod: string | null;
  installmentCount: number | null;
  status: string;
  createdAt: string;
  installments: Installment[];
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function money(cents: number, currency?: string | null) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);
}

function safeDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(parseISO(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

/**
 * The student's own tuition: what's owed, what's paid, and a button to pay
 * the next installment through the school's Stripe account. GET
 * /tuition-payments/me and the checkout route existed, but no student page
 * used them — a student could only pay once, at application time.
 */
export default function StudentTuition() {
  const search = useSearch();
  const queryClient = useQueryClient();
  const [payingId, setPayingId] = useState<string | null>(null);

  const { data: payments, isLoading, isError } = useQuery<TuitionPayment[]>({
    queryKey: ["tuition-payments-me"],
    queryFn: async () => {
      const res = await fetch("/api/tuition-payments/me", { headers: await authHeaders() });
      if (!res.ok) throw new Error("Failed to load tuition");
      return res.json();
    },
  });

  // Ledger-based balance (billed, paid, discounts, outstanding), payment
  // history with receipts and the school's payment instructions. Optional:
  // if it can't load, the page still shows the plans below.
  const { data: statement } = useQuery<StatementPayload | null>({
    queryKey: ["tuition-statement-me"],
    queryFn: async () => {
      const res = await fetch("/api/tuition/me/statement", { headers: await authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });
  const remainingById = new Map((statement?.statement.items ?? []).map((i) => [i.id, i]));
  // Hide "Pay" only when we know online payment isn't available.
  const canPayOnline = statement ? statement.onlinePayments : true;

  useEffect(() => {
    const checkout = new URLSearchParams(search).get("checkout");
    if (checkout === "success") {
      toast.success("Payment received — it can take a moment to show here.");
      queryClient.invalidateQueries({ queryKey: ["tuition-payments-me"] });
      queryClient.invalidateQueries({ queryKey: ["tuition-statement-me"] });
    } else if (checkout === "cancelled") {
      toast.info("Payment cancelled.");
    }
  }, [search, queryClient]);

  const payNext = async (paymentId: string) => {
    setPayingId(paymentId);
    try {
      const res = await fetch(`/api/tuition-payments/${paymentId}/checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ returnTo: "dashboard" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error ?? "Couldn't start the payment");
      window.location.href = body.url;
    } catch (err: any) {
      toast.error(err.message || "Couldn't start the payment");
      setPayingId(null);
    }
  };

  const all = payments ?? [];
  const totalOwed = all.reduce((s, p) => s + (p.amountCents ?? 0), 0);
  const totalPaid = all.reduce(
    (s, p) =>
      s +
      (p.installments.length
        ? p.installments.filter((i) => i.status === "paid").reduce((t, i) => t + i.amountCents, 0)
        : p.status === "paid" ? p.amountCents : 0),
    0
  );
  const currency = all[0]?.currency ?? "usd";

  return (
    <StudentLayout>
      <div className="space-y-6">
        <PageHeader title="Tuition" icon={Wallet} description="Your balance, payment schedule and receipts." />

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Couldn't load your tuition. Try again later.</CardContent>
          </Card>
        ) : all.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Wallet className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
              <p className="font-medium text-foreground">No tuition on file</p>
              <p className="text-sm text-muted-foreground">When your school sets up tuition for you, it will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {statement ? (
              <>
                <BalanceSummary data={statement} />
                <PaymentInstructions data={statement} />
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-semibold">{money(totalOwed, currency)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Paid</p><p className="text-2xl font-semibold text-success">{money(totalPaid, currency)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Balance</p><p className="text-2xl font-semibold">{money(Math.max(totalOwed - totalPaid, 0), currency)}</p></CardContent></Card>
              </div>
            )}

            {all.map((p) => {
              const nextUnpaid = p.installments.find((i) => i.status !== "paid");
              const fullyPaid = p.installments.length ? !nextUnpaid : p.status === "paid";
              return (
                <Card key={p.id}>
                  <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        {p.paymentMethod === "installments" ? `Installment plan · ${p.installmentCount ?? p.installments.length} payments` : "Tuition"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{money(p.amountCents, p.currency)} · started {safeDate(p.createdAt)}</p>
                    </div>
                    {fullyPaid ? (
                      <Badge className="bg-success/10 text-success">Paid in full</Badge>
                    ) : !canPayOnline ? (
                      <Badge variant="outline" className="shrink-0">Pay the school directly</Badge>
                    ) : (
                      <Button onClick={() => payNext(p.id)} disabled={payingId !== null} className="gap-2 shrink-0">
                        {payingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        {nextUnpaid ? `Pay ${money(remainingById.get(nextUnpaid.id)?.remainingCents ?? nextUnpaid.amountCents, p.currency)}` : "Pay now"}
                      </Button>
                    )}
                  </CardHeader>
                  {p.installments.length > 0 && (
                    <CardContent>
                      <div className="divide-y rounded-md border">
                        {p.installments.map((i) => (
                          <div key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                            <span>Payment {i.installmentNumber}</span>
                            <span className="text-muted-foreground">Due {safeDate(i.dueDate)}</span>
                            <span>{money(i.amountCents, p.currency)}</span>
                            <Badge variant={i.status === "paid" ? "default" : "outline"} className="capitalize">
                              {i.status === "paid" && i.paidAt
                                ? `Paid ${safeDate(i.paidAt)}`
                                : i.status === "partial"
                                ? `Part paid · ${money(remainingById.get(i.id)?.remainingCents ?? 0, p.currency)} left`
                                : remainingById.get(i.id)?.overdue
                                ? "Overdue"
                                : i.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {statement && <PaymentHistory data={statement} />}
          </>
        )}
      </div>
    </StudentLayout>
  );
}
