import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListApplications,
  getListApplicationsQueryKey,
  useGetMySchool,
} from "@workspace/api-client-react";
import type { Application as BaseApplication } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { api, ApiError, FEE_STATUS_LABEL, formatMoney, type FeeStatus } from "@/lib/admissions";

// Fee + approval-email fields GET /applications adds for admins.
type Application = BaseApplication & {
  feeStatus?: FeeStatus;
  feeAmountCents?: number | null;
  feeCurrency?: string | null;
  feePaidAt?: string | null;
  feeWaivedAt?: string | null;
  feeWaiverReason?: string | null;
  congratsEmailStatus?: "sent" | "failed" | null;
  congratsEmailSentAt?: string | null;
  congratsEmailError?: string | null;
  applicantEmail?: string | null;
};

interface StatusChangeOptions {
  waiveFee?: boolean;
  waiverReason?: string;
}

function FeeBadge({ app }: { app: Application }) {
  const st = app.feeStatus ?? "not_required";
  if (st === "not_required") return <span className="text-xs text-muted-foreground">Free</span>;
  const amount = app.feeAmountCents != null ? formatMoney(app.feeAmountCents, app.feeCurrency) : "";
  const cls =
    st === "paid"
      ? "bg-success/10 text-success border-success/30"
      : st === "waived"
      ? "bg-muted text-muted-foreground border-border"
      : "bg-warning/10 text-warning border-warning/40";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`} data-testid="fee-badge">
      {FEE_STATUS_LABEL[st]}
      {amount && <span className="opacity-80">· {amount}</span>}
    </span>
  );
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ClipboardList,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  User,
  BookOpen,
  Loader2,
  FileText,
  Globe,
  Lock,
  ArrowLeft,
  CreditCard,
  Mail,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const STATUS_PIPELINE = ["received", "under_review", "finalizing", "approved"];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; badgeClass: string; icon: React.ElementType }
> = {
  received: {
    label: "Received",
    color: "text-warning",
    badgeClass: "bg-warning/10 text-warning border-warning/30",
    icon: Clock,
  },
  under_review: {
    label: "Under Review",
    color: "text-primary",
    badgeClass: "bg-primary/10 text-primary border-primary/30",
    icon: AlertCircle,
  },
  finalizing: {
    label: "Finalizing",
    color: "text-chart-5",
    badgeClass: "bg-chart-5/10 text-chart-5 border-chart-5/30",
    icon: FileText,
  },
  approved: {
    label: "Approved",
    color: "text-success",
    badgeClass: "bg-success/10 text-success border-success/30",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    color: "text-destructive",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG["received"];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.badgeClass}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function getNextStatus(current: string): string | null {
  const idx = STATUS_PIPELINE.indexOf(current?.toLowerCase());
  if (idx === -1 || idx === STATUS_PIPELINE.length - 1) return null;
  return STATUS_PIPELINE[idx + 1];
}

function ApplicationDetailPanel({
  app,
  open,
  onClose,
  onStatusChange,
  updating,
  onChanged,
}: {
  app: Application | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: string, notes?: string, opts?: StatusChangeOptions) => void;
  updating: boolean;
  onChanged: (patch: Partial<Application>) => void;
}) {
  const [notes, setNotes] = useState("");
  const [waiveOpen, setWaiveOpen] = useState<null | "waive" | "approve">(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!app) return null;
  const feeUnpaid = app.feeStatus === "awaiting_payment";

  const waiveOnly = async () => {
    setBusy(true);
    try {
      await api(`/applications/${app.id}/waive-fee`, { method: "POST", body: JSON.stringify({ reason: waiverReason }) });
      toast.success("Application fee waived");
      onChanged({ feeStatus: "waived", feeWaivedAt: new Date().toISOString(), feeWaiverReason: waiverReason || null });
      setWaiveOpen(null);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't waive the fee");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await api(`/applications/${app.id}/resend-congratulations`, { method: "POST" });
      toast.success("Congratulations email sent");
      onChanged({ congratsEmailStatus: "sent", congratsEmailError: null, congratsEmailSentAt: new Date().toISOString() });
    } catch (err) {
      toast.error(`The email could not be sent: ${(err as Error).message}`);
      onChanged({ congratsEmailStatus: "failed", congratsEmailError: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const nextStatus = getNextStatus(app.status);
  const isRejected = app.status?.toLowerCase() === "rejected";
  const isApproved = app.status?.toLowerCase() === "approved";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Application Details</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Applicant Info */}
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
              {(app.applicantName || "?")[0].toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">
                {app.applicantName || "Unknown Applicant"}
              </h3>
              <p className="text-sm text-muted-foreground">Application ID: {app.id.slice(0, 8)}...</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={app.status} />
                <FeeBadge app={app} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Program / Course
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{app.programName || "General Admission"}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Applicant ID
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono text-xs">
                  {app.applicantId || "Not linked to a user account"}
                </span>
              </div>
            </div>
          </div>

          {/* Application fee */}
          {app.feeStatus && app.feeStatus !== "not_required" && (
            <div className={`rounded-lg border p-3 space-y-2 ${feeUnpaid ? "border-warning/50 bg-warning/5" : ""}`} data-testid="fee-panel">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-muted-foreground" /> Application fee
                  {app.feeAmountCents != null && <span className="text-muted-foreground font-normal">{formatMoney(app.feeAmountCents, app.feeCurrency)}</span>}
                </p>
                <FeeBadge app={app} />
              </div>
              {feeUnpaid && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Not paid yet. The applicant can pay from their application page. You can't approve until it's paid, unless you waive it.
                  </p>
                  {waiveOpen ? (
                    <div className="space-y-2">
                      <Label htmlFor="adminadmissions-waiver-reason" className="text-xs">Reason for waiving (optional, internal)</Label>
                      <Textarea id="adminadmissions-waiver-reason" rows={2} maxLength={500} value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} placeholder="e.g. Scholarship applicant" />
                      <div className="flex flex-wrap gap-2">
                        {waiveOpen === "approve" ? (
                          <Button
                            size="sm"
                            disabled={updating}
                            onClick={() => {
                              onStatusChange(app.id, "approved", notes, { waiveFee: true, waiverReason });
                              setWaiveOpen(null);
                            }}
                          >
                            Waive fee &amp; approve
                          </Button>
                        ) : (
                          <Button size="sm" disabled={busy} onClick={waiveOnly}>
                            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                            Waive fee
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setWaiveOpen(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setWaiveOpen("waive")}>Waive fee</Button>
                  )}
                </>
              )}
              {app.feeStatus === "waived" && (
                <p className="text-xs text-muted-foreground">
                  Waived{app.feeWaivedAt ? ` ${formatDistanceToNow(new Date(app.feeWaivedAt), { addSuffix: true })}` : ""}
                  {app.feeWaiverReason ? `: ${app.feeWaiverReason}` : "."}
                </p>
              )}
              {app.feeStatus === "paid" && app.feePaidAt && (
                <p className="text-xs text-muted-foreground">Paid {formatDistanceToNow(new Date(app.feePaidAt), { addSuffix: true })}. Refunds: use your Stripe dashboard.</p>
              )}
            </div>
          )}

          {/* Status Pipeline */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status Progress
            </Label>
            <div className="mt-3 flex items-center gap-1">
              {STATUS_PIPELINE.map((s, i) => {
                const currentIdx = STATUS_PIPELINE.indexOf(app.status?.toLowerCase());
                const isDone = i <= currentIdx;
                const cfg = STATUS_CONFIG[s];
                return (
                  <div key={s} className="flex items-center gap-1 flex-1">
                    <div
                      className={`h-2 flex-1 rounded-full ${
                        isDone ? "bg-primary" : "bg-muted"
                      }`}
                    />
                    {i < STATUS_PIPELINE.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              {STATUS_PIPELINE.map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <span key={s} className="text-xs text-muted-foreground">
                    {cfg.label}
                  </span>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="adminadmissions-add-notes">Add Notes</Label>
            <Textarea id="adminadmissions-add-notes"
              placeholder="Internal notes about this application..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          {!isApproved && !isRejected && (
            <div className="space-y-2">
              {nextStatus && (
                <Button
                  className="w-full"
                  onClick={() => onStatusChange(app.id, nextStatus, notes)}
                  disabled={updating}
                >
                  {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Advance to "{STATUS_CONFIG[nextStatus]?.label}"
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full border-success/30 text-success hover:bg-success/20"
                onClick={() => (feeUnpaid ? setWaiveOpen("approve") : onStatusChange(app.id, "approved", notes))}
                disabled={updating}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {feeUnpaid ? "Approve (fee unpaid)" : "Approve Application"}
              </Button>
              <Button
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/20"
                onClick={() => onStatusChange(app.id, "rejected", notes)}
                disabled={updating}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject Application
              </Button>
            </div>
          )}

          {isApproved && (
            <div className="space-y-2">
              <div className="rounded-lg bg-success/10 border border-success/30 p-4 text-center">
                <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-1" />
                <p className="text-sm font-medium text-success">Application Approved</p>
              </div>
              <div className={`rounded-lg border p-3 text-sm ${app.congratsEmailStatus === "failed" ? "border-destructive/40 bg-destructive/5" : ""}`} data-testid="congrats-email">
                <p className="flex items-center gap-1.5 font-medium">
                  <Mail className="h-4 w-4 text-muted-foreground" /> Congratulations email
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {app.congratsEmailStatus === "sent"
                    ? `Sent${app.congratsEmailSentAt ? ` ${formatDistanceToNow(new Date(app.congratsEmailSentAt), { addSuffix: true })}` : ""}.`
                    : app.congratsEmailStatus === "failed"
                    ? `Could not be sent${app.congratsEmailError ? `: ${app.congratsEmailError}` : "."}`
                    : "No record of it being sent."}
                </p>
                <Button size="sm" variant="outline" className="mt-2" onClick={resend} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Resend congratulations email
                </Button>
              </div>
            </div>
          )}

          {isRejected && (
            <div className="space-y-2">
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-center">
                <XCircle className="h-6 w-6 text-destructive mx-auto mb-1" />
                <p className="text-sm font-medium text-destructive">Application Rejected</p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onStatusChange(app.id, "received", notes)}
                disabled={updating}
              >
                Reopen Application
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "under_review", label: "Under Review" },
  { value: "finalizing", label: "Finalizing" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminAdmissions() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [publishing, setPublishing] = useState(false);

  const { data: school, refetch: refetchSchool } = useGetMySchool();
  const isOpen = (school as any)?.applicationsOpen ?? false;

  const togglePublish = async () => {
    if (!school?.id) return;
    setPublishing(true);
    try {
      await apiFetch(`/api/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationsOpen: !isOpen }),
      });
      await refetchSchool();
      toast.success(isOpen ? "Applications closed." : "Applications are now live!");
    } catch {
      toast.error("Failed to update application status.");
    } finally {
      setPublishing(false);
    }
  };

  const { data: applications, isLoading } = useListApplications(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const [updating, setUpdating] = useState(false);

  // PATCH /applications/:id/status directly (not the generated hook) so the
  // fee gate's 409 code and the approval email result come through.
  const handleStatusChange = async (id: string, status: string, notes?: string, opts?: StatusChangeOptions) => {
    setUpdating(true);
    try {
      const result = await api<Application & { congratsEmail?: { status: "sent" | "failed"; error?: string } | null }>(
        `/applications/${id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, ...(notes ? { notes } : {}), ...(opts?.waiveFee ? { waiveFee: true, waiverReason: opts.waiverReason } : {}) }),
        }
      );
      if (status === "approved" && result.congratsEmail?.status === "failed") {
        toast.warning("Approved, but the email could not be sent", {
          description: "Open the application to resend the congratulations email.",
        });
      } else if (status === "approved") {
        toast.success("Approved. The congratulations email is on its way.");
      } else {
        toast.success(`Status updated to "${STATUS_CONFIG[status]?.label || status}"`);
      }
      queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
      if (selectedApp?.id === id) {
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                status,
                feeStatus: (result.feeStatus as FeeStatus | undefined) ?? prev.feeStatus,
                congratsEmailStatus: result.congratsEmail?.status ?? result.congratsEmailStatus ?? prev.congratsEmailStatus,
                congratsEmailError: result.congratsEmail?.error ?? result.congratsEmailError ?? null,
                congratsEmailSentAt: result.congratsEmailSentAt ?? prev.congratsEmailSentAt,
                feeWaivedAt: result.feeWaivedAt ?? prev.feeWaivedAt,
                feeWaiverReason: result.feeWaiverReason ?? prev.feeWaiverReason,
              }
            : null
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "fee_unpaid") {
        toast.error("The application fee hasn't been paid", { description: "Open the application to waive the fee, or wait for payment." });
        const app = (applications as Application[] | undefined)?.find((a) => a.id === id);
        if (app) setSelectedApp(app);
      } else {
        toast.error((err as Error).message || "Failed to update status");
      }
    } finally {
      setUpdating(false);
    }
  };

  const apps = (applications ?? []) as Application[];

  const counts = {
    all: apps.length,
    received: apps.filter((a) => a.status === "received").length,
    under_review: apps.filter((a) => a.status === "under_review").length,
    finalizing: apps.filter((a) => a.status === "finalizing").length,
    approved: apps.filter((a) => a.status === "approved").length,
    rejected: apps.filter((a) => a.status === "rejected").length,
  };

  return (
    <AdminLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/admin">
          <button className="flex items-center gap-1.5 min-h-10 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Admissions</h1>
            <p className="text-muted-foreground mt-0.5">
              Review and manage student applications.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/admin/admissions/settings">
                <Settings2 className="h-4 w-4 mr-2" />
                Admission settings
              </Link>
            </Button>
            <Button
              onClick={togglePublish}
              disabled={publishing}
              variant={isOpen ? "outline" : "default"}
              className={isOpen ? "border-success/30 text-success hover:bg-success/20" : ""}
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : isOpen ? (
                <Lock className="h-4 w-4 mr-2" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              {isOpen ? "Close Applications" : "Publish Now"}
            </Button>
            </div>
            <span className={`text-xs font-medium ${isOpen ? "text-success" : "text-muted-foreground"}`}>
              {isOpen ? "Applications are LIVE" : "Applications are closed"}
            </span>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {FILTER_TABS.map((tab) => {
            const cfg = STATUS_CONFIG[tab.value] || { badgeClass: "bg-muted/50 text-foreground/80 border-border", icon: ClipboardList };
            const Icon = cfg.icon || ClipboardList;
            const count = counts[tab.value as keyof typeof counts] ?? 0;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  statusFilter === tab.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:border-input"
                }`}
              >
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tab.label}</p>
              </button>
            );
          })}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                statusFilter === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                  statusFilter === tab.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {counts[tab.value as keyof typeof counts] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : apps.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No applications found</p>
                <p className="text-sm mt-1">
                  {statusFilter !== "all"
                    ? `No applications with status "${STATUS_CONFIG[statusFilter]?.label || statusFilter}".`
                    : "No applications have been submitted yet."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Applicant</TableHead>
                    <TableHead className="font-semibold">Program</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Fee</TableHead>
                    <TableHead className="font-semibold">Quick Actions</TableHead>
                    <TableHead className="font-semibold text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apps.map((app) => {
                    const nextStatus = getNextStatus(app.status);
                    return (
                      <TableRow
                        key={app.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedApp(app)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                              {(app.applicantName || "?")[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-sm text-foreground">
                              {app.applicantName || "Unknown"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {app.programName || "General Admission"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={app.status} />
                        </TableCell>
                        <TableCell>
                          <FeeBadge app={app} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {nextStatus && app.status !== "approved" && app.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleStatusChange(app.id, nextStatus)}
                                disabled={updating}
                              >
                                {updating ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 mr-1" />
                                )}
                                {STATUS_CONFIG[nextStatus]?.label}
                              </Button>
                            )}
                            {app.status !== "approved" && app.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/20"
                                onClick={() => handleStatusChange(app.id, "rejected")}
                                disabled={updating}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setSelectedApp(app)}
                          >
                            View
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Panel */}
      <ApplicationDetailPanel
        app={selectedApp}
        open={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        onStatusChange={handleStatusChange}
        updating={updating}
        onChanged={(patch) => {
          setSelectedApp((prev) => (prev ? { ...prev, ...patch } : prev));
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
        }}
      />
    </AdminLayout>
  );
}
