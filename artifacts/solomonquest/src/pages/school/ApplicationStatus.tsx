import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, CreditCard, Layers, Loader2, XCircle } from "lucide-react";
import { api, formatMoney, installmentHint, priceLabel, type ApplicationSummary } from "@/lib/admissions";

const STATUS_TEXT: Record<string, { label: string; tone: string; icon: React.ElementType }> = {
  submitted: { label: "Submitted", tone: "text-primary", icon: Clock },
  received: { label: "Received", tone: "text-primary", icon: Clock },
  under_review: { label: "Under review", tone: "text-primary", icon: Clock },
  finalizing: { label: "Finalizing", tone: "text-primary", icon: Clock },
  approved: { label: "Approved", tone: "text-success", icon: CheckCircle2 },
  rejected: { label: "Not accepted", tone: "text-destructive", icon: XCircle },
};

/**
 * An applicant's own application: status, program and price, and the
 * application fee with "Pay now" while it's unpaid. Stripe Checkout returns
 * here (?checkout=success|cancelled).
 */
export default function ApplicationStatus() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const search = useSearch();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const handledReturn = useRef(false);

  const { data: app, isLoading, isError, error } = useQuery<ApplicationSummary>({
    queryKey: ["application-summary", id],
    queryFn: () => api<ApplicationSummary>(`/applications/${id}/summary`),
    enabled: !!id,
    retry: false,
  });

  // Back from Stripe: ask the server to check the session (the webhook may
  // not have arrived yet), then poll briefly until it reads "paid".
  useEffect(() => {
    if (handledReturn.current) return;
    const checkout = new URLSearchParams(search).get("checkout");
    if (!checkout) return;
    handledReturn.current = true;
    if (checkout === "cancelled") {
      toast.info("Payment cancelled. You can pay whenever you're ready.");
      return;
    }
    if (checkout !== "success") return;
    setConfirming(true);
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const r = await api<{ feeStatus: string }>(`/applications/${id}/fee-checkout/confirm`, { method: "POST" });
        await queryClient.invalidateQueries({ queryKey: ["application-summary", id] });
        if (r.feeStatus === "paid" || tries >= 5) {
          setConfirming(false);
          if (r.feeStatus === "paid") toast.success("Payment received. Thank you!");
          return;
        }
      } catch {
        if (tries >= 5) {
          setConfirming(false);
          return;
        }
      }
      setTimeout(tick, 2000);
    };
    tick();
  }, [search, id, queryClient]);

  const payNow = async () => {
    setPaying(true);
    try {
      const { url } = await api<{ url: string | null }>(`/applications/${id}/fee-checkout`, { method: "POST" });
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("Couldn't open payment. Please try again.");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't open payment");
    } finally {
      setPaying(false);
    }
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-12 max-w-2xl space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </PublicLayout>
    );
  }

  if (isError || !app) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-24 text-center max-w-md">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-xl font-bold mb-2">Application not found</h1>
          <p className="text-muted-foreground mb-6">{(error as Error)?.message || "Sign in with the account you applied with."}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/student">Go to your dashboard</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const st = STATUS_TEXT[app.status] ?? STATUS_TEXT.submitted;
  const StatusIcon = st.icon;
  const fee = app.fee;
  const feeAmount = fee.amountCents != null ? formatMoney(fee.amountCents, fee.currency) : null;

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-10 max-w-2xl space-y-5">
        <div>
          <p className="text-sm text-muted-foreground">Your application to</p>
          <h1 className="text-2xl font-bold text-foreground">{app.schoolName ?? "the school"}</h1>
        </div>

        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <StatusIcon className={`h-6 w-6 shrink-0 ${st.tone}`} />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Application status</p>
              <p className={`text-lg font-semibold ${st.tone}`} data-testid="application-status">{st.label}</p>
            </div>
          </CardContent>
        </Card>

        {fee.status !== "not_required" && (
          <Card className={fee.status === "awaiting_payment" ? "border-warning/50" : ""} data-testid="fee-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Application fee
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{feeAmount}</span>
                {fee.status === "paid" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success" data-testid="fee-status">
                    <CheckCircle2 className="h-3 w-3" /> Paid
                  </span>
                )}
                {fee.status === "waived" && (
                  <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground" data-testid="fee-status">Waived by the school</span>
                )}
                {fee.status === "awaiting_payment" && (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning" data-testid="fee-status">
                    {confirming ? "Checking payment…" : "Awaiting payment"}
                  </span>
                )}
              </div>
              {fee.status === "awaiting_payment" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Your application is saved. The school reviews it once the fee is paid.
                  </p>
                  <Button onClick={payNow} disabled={paying || confirming} className="w-full sm:w-auto">
                    {paying || confirming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                    Pay now
                  </Button>
                  <p className="text-xs text-muted-foreground">Payment is handled securely by Stripe on the school's own account.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {(app.programName || app.courses.length > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                {app.programName ? "Program" : "Courses"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {app.programName && (
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{app.programName}</p>
                  <div className="text-right">
                    <p className="font-semibold">Tuition: {priceLabel(app.price)}</p>
                    {installmentHint(app.price) && <p className="text-xs text-muted-foreground">{installmentHint(app.price)}</p>}
                  </div>
                </div>
              )}
              {app.courses.length > 0 && (
                <p className="text-sm text-muted-foreground">{app.courses.map((c) => c.title).join(", ")}</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {app.schoolSlug && (
            <Button asChild variant="outline">
              <Link href={`/${app.schoolSlug}`}>Back to {app.schoolName}</Link>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href="/dashboard/student">Your dashboard</Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
}
