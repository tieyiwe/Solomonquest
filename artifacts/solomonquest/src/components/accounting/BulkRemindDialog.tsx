import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle2, Loader2, Mail, AlertTriangle } from "lucide-react";
import { apiJson } from "./shared";

const NOTE_MAX = 500;

interface Preview {
  eligible: number;
  skippedRecent: number;
  skippedNoBalance: number;
  emailEnabled: boolean;
  onlinePayments: boolean;
  sample: { studentName: string; subject: string; text: string } | null;
}

export interface SendSummary {
  requested: number;
  sent: number;
  emailed: number;
  inApp: number;
  parentsNotified: number;
  failed: number;
  skippedRecent: number;
  skippedNoBalance: number;
  emailEnabled: boolean;
  results: { studentId: string; studentName: string; outcome: string; error?: string }[];
}

/**
 * Confirm-then-send for balance reminders. Shows how many will go out and a
 * sample of the real message, lets the admin add a short note and choose to
 * copy parents, then sends everything in one request and shows the result.
 */
export function BulkRemindDialog({
  studentIds,
  title,
  onOpenChange,
  onSent,
}: {
  studentIds: string[] | null;
  title?: string;
  onOpenChange: (open: boolean) => void;
  onSent?: (s: SendSummary) => void;
}) {
  const open = !!studentIds && studentIds.length > 0;
  const [note, setNote] = useState("");
  const [notifyParents, setNotifyParents] = useState(false);
  const [override, setOverride] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSummary(null);
    setError(null);
  }, [open, studentIds]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      apiJson<Preview>("/api/accounting/reminders/preview", {
        method: "POST",
        body: JSON.stringify({ studentIds, note, override }),
      })
        .then((p) => { setPreview(p); setError(null); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, note ? 350 : 0);
    return () => clearTimeout(t);
  }, [open, studentIds, note, override]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const s = await apiJson<SendSummary>("/api/accounting/reminders/send", {
        method: "POST",
        body: JSON.stringify({ studentIds, note, notifyParents, override }),
      });
      setSummary(s);
      onSent?.(s);
    } catch (e: any) {
      setError(e.message || "Couldn't send reminders");
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    onOpenChange(false);
    setNote("");
    setNotifyParents(false);
    setOverride(false);
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="bulk-remind-dialog">
        <DialogHeader>
          <DialogTitle>{summary ? "Reminders sent" : title ?? "Send balance reminders"}</DialogTitle>
          {!summary && (
            <DialogDescription>
              Each student gets their own balance, item by item, by email and in-app notification.
            </DialogDescription>
          )}
        </DialogHeader>

        {summary ? (
          <div className="space-y-3" data-testid="remind-summary">
            <div className="grid grid-cols-3 gap-2 text-center">
              <SummaryStat icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Reminded" value={summary.sent} />
              <SummaryStat icon={<Mail className="h-4 w-4 text-primary" />} label="Emails sent" value={summary.emailed} />
              <SummaryStat icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Failed" value={summary.failed} />
            </div>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              {summary.parentsNotified > 0 && <li>{summary.parentsNotified} parent/guardian notification{summary.parentsNotified === 1 ? "" : "s"}.</li>}
              {summary.skippedRecent > 0 && <li>{summary.skippedRecent} skipped: reminded in the last 24 hours.</li>}
              {summary.skippedNoBalance > 0 && <li>{summary.skippedNoBalance} skipped: nothing owed.</li>}
              {!summary.emailEnabled && <li>Email isn't set up on this platform, so reminders went in-app only.</li>}
            </ul>
            {summary.results.filter((r) => r.outcome === "failed").length > 0 && (
              <div className="rounded-md border border-destructive/30 p-2 text-sm">
                {summary.results.filter((r) => r.outcome === "failed").map((r) => (
                  <p key={r.studentId}>{r.studentName}: {r.error}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {loading && !preview ? (
              <Skeleton className="h-32" />
            ) : preview ? (
              <>
                <p className="text-sm" data-testid="remind-count">
                  <strong>{preview.eligible}</strong> student{preview.eligible === 1 ? "" : "s"} will be reminded.
                  {preview.skippedRecent > 0 && <> {preview.skippedRecent} reminded in the last 24 hours will be skipped.</>}
                  {preview.skippedNoBalance > 0 && <> {preview.skippedNoBalance} with nothing owed will be skipped.</>}
                </p>
                {preview.sample && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="remind-sample">
                    <p className="text-xs text-muted-foreground mb-1">Sample, for {preview.sample.studentName}</p>
                    <p className="font-medium mb-1">{preview.sample.subject}</p>
                    <p className="whitespace-pre-wrap break-words">{preview.sample.text}</p>
                  </div>
                )}
                {!preview.emailEnabled && (
                  <p className="text-xs text-warning">Email isn't set up on this platform yet, so reminders will be in-app only.</p>
                )}
              </>
            ) : null}
            <div>
              <Label htmlFor="remind-note">Add a note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea id="remind-note" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The bursar's office is open until 4pm on weekdays." />
              <p className="text-xs text-muted-foreground text-right">{note.length}/{NOTE_MAX}</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyParents} onCheckedChange={(v) => setNotifyParents(v === true)} aria-label="Also notify parents/guardians" />
              Also notify parents/guardians
            </label>
            {(preview?.skippedRecent ?? 0) > 0 || override ? (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={override} onCheckedChange={(v) => setOverride(v === true)} aria-label="Include students reminded in the last 24 hours" />
                Include students reminded in the last 24 hours
              </label>
            ) : null}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          {summary ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={send} disabled={sending || loading || !preview || preview.eligible === 0}>
                {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Bell className="h-4 w-4 mr-1.5" />}
                Send {preview?.eligible ?? ""} reminder{preview?.eligible === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
