import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail, Printer } from "lucide-react";
import { apiJson, day, money } from "@/components/accounting/shared";

interface Receipt {
  entryId: string;
  studentId: string;
  receiptNumber: string | null;
  schoolName: string;
  schoolLogoUrl: string | null;
  studentName: string;
  studentEmail: string | null;
  kind: string;
  amountCents: number;
  currency: string;
  methodLabel: string | null;
  reference: string | null;
  paidOn: string;
  planLabel: string | null;
  appliedTo: { label: string; amountCents: number }[];
  remaining: { currency: string; outstandingCents: number; creditCents: number }[];
  recordedByName: string | null;
  voided: boolean;
  voidReason: string | null;
  note: string | null;
  canEmail: boolean;
}

/**
 * Printable, school-branded receipt for one ledger payment (or refund).
 * Admins of the school, the student and their linked parents can open it;
 * the API enforces that.
 */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeParents, setIncludeParents] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiJson<Receipt>(`/api/tuition/receipts/${id}`)
      .then(setR)
      .catch((e) => setError(e.message || "Receipt not found"));
  }, [id]);

  useEffect(() => {
    if (r) document.title = `Receipt ${r.receiptNumber ?? ""} · ${r.schoolName}`;
  }, [r]);

  const email = async () => {
    setSending(true);
    try {
      const res = await apiJson<{ emailed: number; failed: number }>(`/api/tuition/receipts/${id}/email`, {
        method: "POST",
        body: JSON.stringify({ includeParents }),
      });
      if (res.failed) toast.warning(`Emailed ${res.emailed}, ${res.failed} failed`);
      else toast.success(`Receipt emailed (${res.emailed})`);
    } catch (e: any) {
      toast.error(e.message || "Couldn't email the receipt");
    } finally {
      setSending(false);
    }
  };

  const back = () => (window.history.length > 1 ? window.history.back() : (window.location.href = "/"));

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white py-6 px-4 print:p-0">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="ghost" size="sm" onClick={back}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          <div className="flex-1" />
          {r?.canEmail && (
            <>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={includeParents} onCheckedChange={(v) => setIncludeParents(v === true)} aria-label="Also email parents/guardians" />
                Also email parents/guardians
              </label>
              <Button variant="outline" size="sm" onClick={email} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}Email receipt to student
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => window.print()} disabled={!r}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>

        {error ? (
          <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">{error}</div>
        ) : !r ? (
          <Skeleton className="h-[520px] w-full" />
        ) : (
          <article className="relative overflow-hidden rounded-lg border bg-white text-slate-900 shadow-sm print:shadow-none print:border-0" data-testid="receipt">
            {r.voided && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="rotate-[-24deg] text-7xl font-black tracking-widest text-red-600/20">VOID</span>
              </div>
            )}
            <header className="flex items-center gap-3 bg-[#141d33] px-6 py-5 text-white print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
              {r.schoolLogoUrl && <img src={r.schoolLogoUrl} alt="" className="h-10 max-w-[120px] object-contain" />}
              <div className="min-w-0">
                <p className="text-lg font-bold truncate">{r.schoolName}</p>
                <p className="text-xs opacity-80">{r.kind === "refund" ? "Refund receipt" : "Payment receipt"}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs opacity-80">Receipt no.</p>
                <p className="font-mono text-sm" data-testid="receipt-number">{r.receiptNumber ?? "—"}</p>
              </div>
            </header>
            <div className="space-y-6 px-6 py-6">
              {r.voided && (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  This receipt was voided{r.voidReason ? `: ${r.voidReason}` : "."}
                </p>
              )}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{r.kind === "refund" ? "Refunded to" : "Received from"}</p>
                  <p className="text-lg font-semibold">{r.studentName}</p>
                  {r.studentEmail && <p className="text-sm text-slate-500">{r.studentEmail}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
                  <p className="text-3xl font-bold tabular-nums" data-testid="receipt-amount">{money(r.amountCents, r.currency)}</p>
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Field label="Date received" value={day(r.paidOn)} />
                <Field label="Method" value={r.methodLabel ?? "—"} />
                <Field label="Reference" value={r.reference ?? "—"} />
                <Field label="For" value={r.planLabel ?? "Tuition"} />
              </dl>
              {r.appliedTo.length > 0 && (
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Applied to</p>
                  <ul className="divide-y rounded-md border text-sm">
                    {r.appliedTo.map((a, i) => (
                      <li key={i} className="flex justify-between gap-3 px-3 py-2"><span>{a.label}</span><span className="tabular-nums">{money(a.amountCents, r.currency)}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3 print:[-webkit-print-color-adjust:exact]">
                <span className="text-sm font-medium">Remaining balance</span>
                <span className="text-right font-semibold tabular-nums" data-testid="receipt-remaining">
                  {r.remaining.length === 0
                    ? money(0, r.currency)
                    : r.remaining.map((x) => (
                        <span key={x.currency} className="block">
                          {money(x.outstandingCents, x.currency)}{x.creditCents > 0 ? ` (credit ${money(x.creditCents, x.currency)})` : ""}
                        </span>
                      ))}
                </span>
              </div>
              {r.note && <p className="text-sm text-slate-600">Note: {r.note}</p>}
              <p className="text-xs text-slate-500">
                {r.recordedByName ? `Recorded by ${r.recordedByName}. ` : ""}Balance shown as at the time of this receipt. Keep this receipt for your records.
              </p>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
