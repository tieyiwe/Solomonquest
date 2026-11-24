import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiJson, itemLabel, METHODS, money, toCents, todayLocal, type LedgerEntry, type Statement, type StatementPayload } from "./shared";

export type EntryMode = "payment" | "discount" | "waiver" | "refund";

const MODE_TITLE: Record<EntryMode, string> = {
  payment: "Record a payment",
  discount: "Apply a discount or scholarship",
  waiver: "Waive part of the balance",
  refund: "Record a refund",
};

export interface RecordResult {
  entry: LedgerEntry;
  appliedTo: { itemId: string; label: string; amountCents: number }[];
  creditCents: number;
  statement: Statement;
  receiptPath: string | null;
}

/**
 * Record money received (or a discount, waiver or refund) against one
 * student's balance. The server applies it oldest-due-first unless a plan or
 * installment is picked, and refuses an overpayment unless the admin ticks
 * "Keep the extra as credit".
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  initialMode = "payment",
  initialPaymentId,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string | null;
  studentName?: string;
  initialMode?: EntryMode;
  initialPaymentId?: string | null;
  onRecorded?: (r: RecordResult) => void;
}) {
  const [data, setData] = useState<StatementPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [label, setLabel] = useState("Scholarship");
  const [applyTo, setApplyTo] = useState("auto");
  const [allowCredit, setAllowCredit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !studentId) return;
    setMode(initialMode);
    setAmount("");
    setDate(todayLocal());
    setMethod("cash");
    setReference("");
    setNote("");
    setLabel("Scholarship");
    setApplyTo(initialPaymentId ? `plan:${initialPaymentId}` : "auto");
    setAllowCredit(false);
    setError(null);
    setLoading(true);
    apiJson<StatementPayload>(`/api/accounting/students/${studentId}/statement`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, studentId, initialMode, initialPaymentId]);

  const st = data?.statement;
  const target = useMemo(() => {
    if (!st) return null;
    if (applyTo.startsWith("inst:")) return { kind: "inst" as const, item: st.items.find((i) => i.id === applyTo.slice(5)) };
    if (applyTo.startsWith("plan:")) return { kind: "plan" as const, paymentId: applyTo.slice(5) };
    return null;
  }, [applyTo, st]);
  const currency = useMemo(() => {
    if (!st) return "usd";
    if (target?.kind === "inst" && target.item) return target.item.currency;
    if (target?.kind === "plan") return st.items.find((i) => i.paymentId === target.paymentId)?.currency ?? st.primaryCurrency;
    return st.primaryCurrency;
  }, [st, target]);
  const totals = st?.totals.find((t) => t.currency === currency);
  const outstanding = totals?.outstandingCents ?? 0;
  const cents = toCents(amount);
  const over = mode === "payment" && cents !== null && cents > outstanding;
  const openItems = (st?.items ?? []).filter((i) => i.remainingCents > 0);

  const submit = async () => {
    if (!studentId) return;
    if (cents === null || cents <= 0) {
      setError("Enter an amount greater than zero, e.g. 225.00");
      return;
    }
    if (over && !allowCredit) {
      setError(`That is ${money(cents - outstanding, currency)} more than the ${money(outstanding, currency)} still owed. Lower the amount or tick "Keep the extra as credit".`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        kind: mode,
        amountCents: cents,
        currency,
        paidOn: date,
        reference: reference || undefined,
        note: note || undefined,
        allowCredit,
      };
      if (mode === "payment" || mode === "refund") body.method = method;
      if (mode === "discount") body.label = label || "Discount";
      if (target?.kind === "inst" && target.item) {
        body.installmentId = target.item.installmentId ?? undefined;
        body.paymentId = target.item.paymentId;
      } else if (target?.kind === "plan") body.paymentId = target.paymentId;
      const res = await apiJson<RecordResult>(`/api/accounting/students/${studentId}/ledger`, { method: "POST", body: JSON.stringify(body) });
      const verb = mode === "payment" ? "Payment recorded" : mode === "refund" ? "Refund recorded" : mode === "waiver" ? "Waiver applied" : `${label || "Discount"} applied`;
      toast.success(`${verb}: ${money(cents, currency)}`, {
        description: res.creditCents > 0 ? `${money(res.creditCents, currency)} kept as credit.` : res.appliedTo.length ? `Applied to ${res.appliedTo.map((a) => a.label).join("; ")}` : undefined,
        action: res.receiptPath ? { label: "View receipt", onClick: () => window.open(res.receiptPath as string, "_blank") } : undefined,
      });
      onRecorded?.(res);
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const remainingAfter = cents !== null ? (mode === "refund" ? outstanding + cents : Math.max(0, outstanding - cents)) : outstanding;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="record-payment-dialog">
        <DialogHeader>
          <DialogTitle>{MODE_TITLE[mode]}</DialogTitle>
          <DialogDescription>{studentName ?? data?.student?.name ?? "Student"}</DialogDescription>
        </DialogHeader>
        {loading || !st ? (
          error ? <p className="text-sm text-destructive">{error}</p> : <Skeleton className="h-48" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Outstanding now</p>
                <p className="font-semibold tabular-nums" data-testid="rp-outstanding">{money(outstanding, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">After this</p>
                <p className="font-semibold tabular-nums">{money(remainingAfter, currency)}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="rp-type">Type</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as EntryMode)}>
                  <SelectTrigger id="rp-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">Payment received</SelectItem>
                    <SelectItem value="discount">Discount or scholarship</SelectItem>
                    <SelectItem value="waiver">Waiver</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rp-amount">Amount ({currency.toUpperCase()})</Label>
                <Input id="rp-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} />
              </div>
              <div>
                <Label htmlFor="rp-date">{mode === "payment" ? "Date received" : "Date"}</Label>
                <Input id="rp-date" type="date" max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {(mode === "payment" || mode === "refund") ? (
                <div>
                  <Label htmlFor="rp-method">Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger id="rp-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : mode === "discount" ? (
                <div>
                  <Label htmlFor="rp-label">Name</Label>
                  <Input id="rp-label" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Scholarship, Sibling discount…" />
                </div>
              ) : <div />}
            </div>

            {(mode === "payment" || mode === "refund") && (
              <div>
                <Label htmlFor="rp-ref">Reference number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="rp-ref" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref, cheque no., M-Pesa code…" />
              </div>
            )}

            {mode !== "refund" && (
              <div>
                <Label htmlFor="rp-apply">Apply to</Label>
                <Select value={applyTo} onValueChange={setApplyTo}>
                  <SelectTrigger id="rp-apply"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Oldest due first (recommended)</SelectItem>
                    {(data?.plans ?? []).map((p) => (
                      <SelectItem key={p.paymentId} value={`plan:${p.paymentId}`}>Plan: {p.label}</SelectItem>
                    ))}
                    {openItems.filter((i) => i.installmentId).map((i) => (
                      <SelectItem key={i.id} value={`inst:${i.id}`}>
                        {itemLabel(i)} · {money(i.remainingCents, i.currency)} left
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Anything beyond the chosen item goes to the next oldest one.</p>
              </div>
            )}

            <div>
              <Label htmlFor="rp-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea id="rp-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {over && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm space-y-2" role="alert">
                <p>
                  This is {money((cents ?? 0) - outstanding, currency)} more than the {money(outstanding, currency)} still owed.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={allowCredit} onCheckedChange={(v) => setAllowCredit(v === true)} aria-label="Keep the extra as credit" />
                  <span>Keep the extra as credit (used automatically for the next charge)</span>
                </label>
              </div>
            )}

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || loading || !st}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {mode === "payment" ? "Record payment" : mode === "refund" ? "Record refund" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
