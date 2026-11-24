import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Ban, Bell, FileText, Gift, Plus } from "lucide-react";
import {
  apiJson,
  day,
  entryEffect,
  entryTitle,
  itemLabel,
  money,
  STATUS_LABEL,
  STATUS_STYLE,
  type LedgerEntry,
  type StatementPayload,
} from "./shared";
import { RecordPaymentDialog, type EntryMode } from "./RecordPaymentDialog";

const ITEM_STATUS: Record<string, string> = { paid: "Paid", partial: "Part paid", pending: "Unpaid" };

/** One student's account: what's billed, every ledger entry, reminders. */
export function StudentLedgerSheet({
  studentId,
  onOpenChange,
  onChanged,
  onRemind,
}: {
  studentId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  onRemind?: (studentId: string) => void;
}) {
  const [data, setData] = useState<StatementPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordMode, setRecordMode] = useState<EntryMode | null>(null);
  const [voiding, setVoiding] = useState<LedgerEntry | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      setData(await apiJson<StatementPayload>(`/api/accounting/students/${studentId}/statement`));
    } catch (e: any) {
      toast.error(e.message || "Couldn't load this student's account");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const doVoid = async () => {
    if (!voiding) return;
    if (reason.trim().length < 3) {
      toast.error("Give a short reason");
      return;
    }
    setBusy(true);
    try {
      await apiJson(`/api/accounting/ledger/${voiding.id}/void`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      toast.success("Entry voided. The balance has been recalculated.");
      setVoiding(null);
      setReason("");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Couldn't void the entry");
    } finally {
      setBusy(false);
    }
  };

  const st = data?.statement;
  const t = st?.totals[0];

  return (
    <>
      <Sheet open={!!studentId} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto" data-testid="student-ledger">
          <SheetHeader>
            <SheetTitle>{data?.student?.name ?? "Student account"}</SheetTitle>
            <SheetDescription>{data?.student?.email ?? ""}</SheetDescription>
          </SheetHeader>
          {loading && !data ? (
            <div className="space-y-3 mt-4"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
          ) : st && t ? (
            <div className="space-y-5 mt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={STATUS_STYLE[st.status]}>{STATUS_LABEL[st.status]}</Badge>
                {st.nextDue && (
                  <span className="text-sm text-muted-foreground">
                    Next: {money(st.nextDue.amountCents, st.nextDue.currency)} {st.nextDue.dueDate ? `due ${day(st.nextDue.dueDate)}` : ""}
                  </span>
                )}
              </div>
              {st.totals.map((x) => (
                <div key={x.currency} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <Stat label="Billed" value={money(x.billedCents, x.currency)} />
                  <Stat label="Paid" value={money(x.paidCents, x.currency)} tone="text-success" />
                  <Stat label="Discounts" value={money(x.discountCents, x.currency)} />
                  <Stat label={x.creditCents > 0 ? "Credit" : "Outstanding"} value={money(x.creditCents > 0 ? x.creditCents : x.outstandingCents, x.currency)} tone={x.outstandingCents > 0 ? "text-destructive" : "text-success"} testId="ledger-outstanding" />
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setRecordMode("payment")}><Plus className="h-4 w-4 mr-1" />Record payment</Button>
                <Button size="sm" variant="outline" onClick={() => setRecordMode("discount")}><Gift className="h-4 w-4 mr-1" />Discount / waiver</Button>
                <Button size="sm" variant="outline" onClick={() => setRecordMode("refund")}>Refund</Button>
                {onRemind && t.outstandingCents > 0 && studentId && (
                  <Button size="sm" variant="outline" onClick={() => onRemind(studentId)}><Bell className="h-4 w-4 mr-1" />Remind</Button>
                )}
              </div>

              <section>
                <h3 className="text-sm font-semibold mb-2">Billed</h3>
                <div className="divide-y rounded-md border text-sm">
                  {st.items.length === 0 && <p className="p-3 text-muted-foreground">Nothing billed yet.</p>}
                  {st.items.map((i) => (
                    <div key={i.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{itemLabel(i)}</p>
                        <p className={`text-xs ${i.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {i.dueDate ? `Due ${day(i.dueDate)}` : "No due date"}{i.overdue ? " · overdue" : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="tabular-nums">{money(i.amountCents, i.currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {ITEM_STATUS[i.status]}{i.status === "partial" ? ` · ${money(i.remainingCents, i.currency)} left` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Ledger</h3>
                <div className="divide-y rounded-md border text-sm" data-testid="ledger-entries">
                  {data.entries.length === 0 && <p className="p-3 text-muted-foreground">No payments or adjustments yet.</p>}
                  {data.entries.map((e) => (
                    <div key={e.id} className={`p-3 space-y-1 ${e.voidedAt ? "opacity-60" : ""}`} data-testid="ledger-entry">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`font-medium ${e.voidedAt ? "line-through" : ""}`}>{entryTitle(e)}</p>
                          <p className="text-xs text-muted-foreground">
                            {day(e.paidOn)}{e.receiptNumber ? ` · ${e.receiptNumber}` : ""}{e.reference ? ` · Ref ${e.reference}` : ""}
                            {e.recordedByName ? ` · by ${e.recordedByName}` : e.source === "stripe" ? " · Stripe" : e.source === "backfill" ? " · imported" : ""}
                          </p>
                        </div>
                        <p className={`tabular-nums shrink-0 font-medium ${entryEffect(e) < 0 ? "text-success" : "text-destructive"} ${e.voidedAt ? "line-through" : ""}`}>
                          {entryEffect(e) < 0 ? "−" : "+"}{money(Math.abs(e.amountCents), e.currency)}
                        </p>
                      </div>
                      {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                      {e.voidedAt ? (
                        <p className="text-xs text-destructive">Void{e.voidedByName ? ` by ${e.voidedByName}` : ""} on {day(e.voidedAt)}: {e.voidReason}</p>
                      ) : (
                        <div className="flex gap-1 -ml-2">
                          {e.receiptNumber && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={`/receipts/${e.id}`} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5 mr-1" />Receipt</a>
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setVoiding(e); setReason(""); }}>
                            <Ban className="h-3.5 w-3.5 mr-1" />Void
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Reminders sent</h3>
                <div className="divide-y rounded-md border text-sm">
                  {data.reminders.length === 0 && <p className="p-3 text-muted-foreground">No reminders yet.</p>}
                  {data.reminders.map((r) => (
                    <div key={r.id} className="p-3 flex items-start justify-between gap-3">
                      <div>
                        <p>{day(r.sentAt)} {new Date(r.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{r.sentByName ? ` · ${r.sentByName}` : ""}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.channels.map((c) => (c === "in_app" ? "In-app" : c === "email" ? "Email" : c === "parents" ? `Parents (${r.parentsNotified})` : c)).join(", ") || "—"}
                          {r.emailStatus && r.emailStatus !== "sent" ? ` · email ${r.emailStatus.replace("_", " ")}` : ""}
                        </p>
                      </div>
                      <p className="tabular-nums shrink-0">{money(r.balanceCents, r.currency)}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <RecordPaymentDialog
        open={recordMode !== null}
        onOpenChange={(o) => !o && setRecordMode(null)}
        studentId={studentId}
        studentName={data?.student?.name}
        initialMode={recordMode ?? "payment"}
        onRecorded={() => {
          load();
          onChanged?.();
        }}
      />

      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void this entry?</DialogTitle>
            <DialogDescription>
              {voiding ? `${entryTitle(voiding)} of ${money(Math.abs(voiding.amountCents), voiding.currency)} on ${day(voiding.paidOn)}.` : ""} It stays in the ledger,
              marked void, and no longer counts towards the balance. This can't be undone; record it again if needed.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea id="void-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice by mistake" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVoiding(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doVoid} disabled={busy}>Void entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: string; tone?: string; testId?: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${tone ?? ""}`} data-testid={testId}>{value}</p>
    </div>
  );
}
