import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
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
import { CheckCircle2, DollarSign } from "lucide-react";

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

export default function AdminTuition() {
  const [plans, setPlans] = useState<TuitionPlan[] | null>(null);
  const [payments, setPayments] = useState<TuitionPayment[] | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
            Track tuition plans and payments across your school. Online payment isn't connected yet — record
            payments received outside the platform (cash, check, bank transfer) using "Mark Paid" below.
          </p>
        </div>

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
