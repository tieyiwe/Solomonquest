import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
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
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { CheckCircle2, DollarSign, CreditCard, ExternalLink, Loader2 } from "lucide-react";

async function apiFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.headers ?? {}),
    },
  });
}

interface TuitionPlan {
  id: string;
  courseId: string | null;
  programId: string | null;
  amountCents: number;
  allowFullPayment: boolean;
  allowInstallments: boolean;
  installmentCount: number;
}

interface TuitionPayment {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string | null;
  programId: string | null;
  amountCents: number;
  paymentMethod: "full" | "installments";
  installmentCount: number;
  status: "pending" | "partial" | "paid";
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-700 hover:bg-green-100",
  partial: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  pending: "bg-gray-100 text-gray-600 hover:bg-gray-100",
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type ConnectStatus = "not_connected" | "pending" | "connected" | "restricted";

const CONNECT_STATUS_LABEL: Record<ConnectStatus, string> = {
  not_connected: "Not connected",
  pending: "Setup incomplete",
  connected: "Connected",
  restricted: "Action needed",
};

const CONNECT_STATUS_STYLE: Record<ConnectStatus, string> = {
  not_connected: "bg-gray-100 text-gray-600",
  pending: "bg-yellow-100 text-yellow-700",
  connected: "bg-green-100 text-green-700",
  restricted: "bg-red-100 text-red-700",
};

export default function AdminTuition() {
  const { user } = useAuth();
  const schoolId = (user?.schoolId ?? (user as any)?.school_id) || "";
  const [plans, setPlans] = useState<TuitionPlan[] | null>(null);
  const [payments, setPayments] = useState<TuitionPayment[] | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [plansRes, paymentsRes] = await Promise.all([
        apiFetch("/api/tuition-plans"),
        apiFetch("/api/tuition-payments"),
      ]);
      if (plansRes.ok) setPlans(await plansRes.json());
      if (paymentsRes.ok) setPayments(await paymentsRes.json());
      if (!plansRes.ok || !paymentsRes.ok) toast.error("Failed to load tuition data");
    } catch {
      toast.error("Failed to load tuition data");
    }
  }, []);

  const fetchConnectStatus = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/stripe/status`);
      if (res.ok) {
        const data = await res.json();
        setConnectStatus(data.status);
      }
    } catch {
      // Non-fatal — the connect card just shows "Not connected" until this succeeds
    }
  }, [schoolId]);

  useEffect(() => {
    fetchAll();
    fetchConnectStatus();
  }, [fetchAll, fetchConnectStatus]);

  const handleConnectStripe = async () => {
    if (!schoolId) return;
    setConnectLoading(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/stripe/connect`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start Stripe setup");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || "Failed to start Stripe setup");
      setConnectLoading(false);
    }
  };

  const handleOpenDashboard = async () => {
    if (!schoolId) return;
    setConnectLoading(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/stripe/dashboard-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to open Stripe dashboard");
      window.open(data.url, "_blank");
    } catch (err: any) {
      toast.error(err.message || "Failed to open Stripe dashboard");
    } finally {
      setConnectLoading(false);
    }
  };

  const handleMarkPaid = async (paymentId: string) => {
    setMarkingId(paymentId);
    try {
      const res = await apiFetch(`/api/tuition-payments/${paymentId}/simulate-pay`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to record payment");
      }
      toast.success("Payment recorded");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setMarkingId(null);
    }
  };

  const totalCollected = (payments ?? [])
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const totalOutstanding = (payments ?? [])
    .filter((p) => p.status !== "paid")
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tuition</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track tuition plans and payments across your school.{" "}
            {connectStatus === "connected"
              ? "Online payments go directly to your school's own Stripe account."
              : "Connect Stripe below to take online payments, or record payments received outside the platform (cash, check, bank transfer) using \"Mark Paid\"."}
          </p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Online Payments (Stripe)</p>
                {connectStatus && (
                  <Badge className={CONNECT_STATUS_STYLE[connectStatus]} variant="secondary">
                    {CONNECT_STATUS_LABEL[connectStatus]}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your school connects its own Stripe account — payments go straight to you, independent of the
                SolomonQuest platform. We never see or hold your funds.
              </p>
            </div>
            {connectStatus === "connected" ? (
              <Button size="sm" variant="outline" onClick={handleOpenDashboard} disabled={connectLoading}>
                {connectLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-1.5" />}
                Open Stripe Dashboard
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnectStripe} disabled={connectLoading || !schoolId}>
                {connectLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5 mr-1.5" />}
                {connectStatus === "pending" ? "Finish Connecting Stripe" : "Connect Stripe Account"}
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Tuition Plans Set</p>
              <p className="text-2xl font-bold mt-1">{plans === null ? <Skeleton className="h-8 w-12" /> : plans.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Collected</p>
              <p className="text-2xl font-bold mt-1 text-green-600">
                {payments === null ? <Skeleton className="h-8 w-20" /> : formatCents(totalCollected)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-bold mt-1 text-orange-600">
                {payments === null ? <Skeleton className="h-8 w-20" /> : formatCents(totalOutstanding)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">Tuition Plans</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set per-course tuition from the course's edit page in{" "}
                <Link href="/dashboard/admin/courses"><a className="text-primary hover:underline">Courses</a></Link>.
              </p>
            </div>
            {plans === null ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : plans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tuition plans set yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Options</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {plan.courseId ? `Course ${plan.courseId.slice(0, 8)}…` : `Program ${plan.programId?.slice(0, 8)}…`}
                      </TableCell>
                      <TableCell className="font-medium">{formatCents(plan.amountCents)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[
                          plan.allowFullPayment && "Full payment",
                          plan.allowInstallments && `Installments (${plan.installmentCount})`,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">Payments</h2>
            </div>
            {payments === null ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tuition payments yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.studentName}</TableCell>
                      <TableCell>{formatCents(payment.amountCents)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {payment.paymentMethod === "installments"
                          ? `Installments (${payment.installmentCount})`
                          : "Full payment"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[payment.status] ?? ""} variant="secondary">
                          {payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {payment.status !== "paid" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={markingId === payment.id}
                            onClick={() => handleMarkPaid(payment.id)}
                          >
                            <DollarSign className="h-3.5 w-3.5 mr-1" />
                            {markingId === payment.id
                              ? "Recording…"
                              : payment.status === "partial"
                              ? "Mark Next Installment Paid"
                              : "Mark Paid"}
                          </Button>
                        ) : (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
