import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Download,
  Bell,
  Trash2,
  Pencil,
  Search,
} from "lucide-react";

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

async function apiDownload(path: string, filename: string) {
  const res = await apiFetch(path);
  if (!res.ok) {
    toast.error("Export failed");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Summary {
  from: string;
  to: string;
  revenueCents: number;
  expensesCents: number;
  netCents: number;
  expensesByCategory: { category: string; amountCents: number }[];
  monthly: { month: string; revenueCents: number; expensesCents: number; netCents: number }[];
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amountCents: number;
  expenseDate: string;
  createdByName: string | null;
  createdAt: string;
}

interface StudentBalance {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  totalOwedCents: number;
  totalPaidCents: number;
  balanceCents: number;
  paymentStatus: "paid" | "partial" | "owing";
  lastPaymentAt: string | null;
  nextDueDate: string | null;
  paymentCount: number;
}

const STATUS_STYLE: Record<StudentBalance["paymentStatus"], string> = {
  paid: "bg-green-500/15 text-green-400 border-green-500/30",
  partial: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  owing: "bg-red-500/15 text-red-400 border-red-500/30",
};
const STATUS_LABEL: Record<StudentBalance["paymentStatus"], string> = {
  paid: "Paid in full",
  partial: "Partial balance",
  owing: "Owing",
};

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default function AdminAccounting() {
  const [tab, setTab] = useState("overview");
  const [range] = useState(defaultRange());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState({ category: "other", description: "", amount: "", date: new Date().toISOString().slice(0, 10) });
  const [savingExpense, setSavingExpense] = useState(false);

  const [students, setStudents] = useState<StudentBalance[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "partial" | "owing">("all");
  const [search, setSearch] = useState("");
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await apiFetch(`/api/accounting/summary?from=${range.from}&to=${range.to}`);
      if (res.ok) setSummary(await res.json());
    } finally {
      setSummaryLoading(false);
    }
  }, [range.from, range.to]);

  const fetchExpenses = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const res = await apiFetch(`/api/accounting/expenses?from=${range.from}&to=${range.to}`);
      if (res.ok) setExpenses(await res.json());
    } finally {
      setExpensesLoading(false);
    }
  }, [range.from, range.to]);

  const fetchStudents = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const res = await apiFetch("/api/accounting/students");
      if (res.ok) setStudents(await res.json());
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchExpenses();
    fetchStudents();
  }, [fetchSummary, fetchExpenses, fetchStudents]);

  function openNewExpense() {
    setEditingExpense(null);
    setExpenseForm({ category: "other", description: "", amount: "", date: new Date().toISOString().slice(0, 10) });
    setExpenseDialogOpen(true);
  }

  function openEditExpense(e: Expense) {
    setEditingExpense(e);
    setExpenseForm({ category: e.category, description: e.description, amount: (e.amountCents / 100).toFixed(2), date: e.expenseDate });
    setExpenseDialogOpen(true);
  }

  async function saveExpense() {
    const amountCents = Math.round(parseFloat(expenseForm.amount) * 100);
    if (!expenseForm.description.trim() || isNaN(amountCents) || amountCents < 0) {
      toast.error("Enter a description and a valid amount");
      return;
    }
    setSavingExpense(true);
    try {
      const res = await apiFetch(editingExpense ? `/api/accounting/expenses/${editingExpense.id}` : "/api/accounting/expenses", {
        method: editingExpense ? "PUT" : "POST",
        body: JSON.stringify({
          category: expenseForm.category,
          description: expenseForm.description,
          amountCents,
          expenseDate: expenseForm.date,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save expense");
        return;
      }
      toast.success(editingExpense ? "Expense updated" : "Expense added");
      setExpenseDialogOpen(false);
      fetchExpenses();
      fetchSummary();
    } finally {
      setSavingExpense(false);
    }
  }

  async function deleteExpense(id: string) {
    const res = await apiFetch(`/api/accounting/expenses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete expense");
      return;
    }
    toast.success("Expense deleted");
    fetchExpenses();
    fetchSummary();
  }

  async function sendReminder(studentId: string) {
    setRemindingId(studentId);
    try {
      const res = await apiFetch(`/api/accounting/students/${studentId}/remind`, { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) {
        toast.error("Failed to send reminder");
        return;
      }
      toast.success("Reminder sent");
    } finally {
      setRemindingId(null);
    }
  }

  const filteredStudents = students
    .filter((s) => (statusFilter === "all" ? true : s.paymentStatus === statusFilter))
    .filter((s) => (search.trim() ? (s.studentName + s.studentEmail).toLowerCase().includes(search.toLowerCase()) : true));

  const counts = {
    paid: students.filter((s) => s.paymentStatus === "paid").length,
    partial: students.filter((s) => s.paymentStatus === "partial").length,
    owing: students.filter((s) => s.paymentStatus === "owing").length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Accounting
            </h1>
            <p className="text-muted-foreground text-sm">Revenue, expenses, and student balances in one place.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => apiDownload("/api/accounting/export/payments", "tuition-payments.csv")}>
              <Download className="h-4 w-4 mr-1.5" />
              Export payments
            </Button>
            <Button variant="outline" size="sm" onClick={() => apiDownload(`/api/accounting/export/expenses?from=${range.from}&to=${range.to}`, "expenses.csv")}>
              <Download className="h-4 w-4 mr-1.5" />
              Export expenses
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview (P&amp;L)</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="students">Student Balances</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {summaryLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : summary ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingUp className="h-4 w-4 text-green-400" /> Revenue
                      </div>
                      <div className="text-2xl font-bold text-green-400">{money(summary.revenueCents)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingDown className="h-4 w-4 text-red-400" /> Expenses
                      </div>
                      <div className="text-2xl font-bold text-red-400">{money(summary.expensesCents)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="h-4 w-4 text-primary" /> Net
                      </div>
                      <div className={`text-2xl font-bold ${summary.netCents >= 0 ? "text-green-400" : "text-red-400"}`}>{money(summary.netCents)}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Monthly trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {summary.monthly.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No activity in this range yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {summary.monthly.map((m) => {
                          const max = Math.max(...summary.monthly.map((x) => Math.max(x.revenueCents, x.expensesCents)), 1);
                          return (
                            <div key={m.month} className="grid grid-cols-[80px_1fr_1fr] items-center gap-3 text-xs">
                              <span className="text-muted-foreground">{m.month}</span>
                              <div className="flex items-center gap-2">
                                <div className="h-2 rounded-full bg-green-500" style={{ width: `${(m.revenueCents / max) * 100}%`, minWidth: m.revenueCents ? "4px" : 0 }} />
                                <span className="text-green-400">{money(m.revenueCents)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-2 rounded-full bg-red-500" style={{ width: `${(m.expensesCents / max) * 100}%`, minWidth: m.expensesCents ? "4px" : 0 }} />
                                <span className="text-red-400">{money(m.expensesCents)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Expenses by category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {summary.expensesByCategory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No expenses recorded in this range.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {summary.expensesByCategory.map((c) => (
                          <Badge key={c.category} variant="outline" className="text-sm py-1">
                            {c.category}: {money(c.amountCents)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="expenses" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openNewExpense}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add expense
              </Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                {expensesLoading ? (
                  <Skeleton className="h-40" />
                ) : expenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No expenses recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Added by</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.expenseDate}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{e.category}</Badge>
                          </TableCell>
                          <TableCell>{e.description}</TableCell>
                          <TableCell className="text-red-400 font-medium">{money(e.amountCents)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{e.createdByName || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEditExpense(e)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteExpense(e.id)}>
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="students" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All students ({students.length})</SelectItem>
                  <SelectItem value="paid">Paid in full ({counts.paid})</SelectItem>
                  <SelectItem value="partial">Partial balance ({counts.partial})</SelectItem>
                  <SelectItem value="owing">Owing ({counts.owing})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="pt-6">
                {studentsLoading ? (
                  <Skeleton className="h-40" />
                ) : filteredStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No students match this filter.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Owed</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Last payment</TableHead>
                        <TableHead>Next due</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((s) => (
                        <TableRow key={s.studentId}>
                          <TableCell>
                            <div className="font-medium">{s.studentName}</div>
                            <div className="text-xs text-muted-foreground">{s.studentEmail}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_STYLE[s.paymentStatus]}>
                              {STATUS_LABEL[s.paymentStatus]}
                            </Badge>
                          </TableCell>
                          <TableCell>{money(s.totalOwedCents)}</TableCell>
                          <TableCell className="text-green-400">{money(s.totalPaidCents)}</TableCell>
                          <TableCell className={s.balanceCents > 0 ? "text-red-400 font-medium" : "text-muted-foreground"}>{money(s.balanceCents)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.lastPaymentAt ? new Date(s.lastPaymentAt).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.nextDueDate ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {s.balanceCents > 0 && (
                              <Button variant="outline" size="sm" disabled={remindingId === s.studentId} onClick={() => sendReminder(s.studentId)}>
                                <Bell className="h-3.5 w-3.5 mr-1.5" />
                                {remindingId === s.studentId ? "Sending..." : "Remind"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit expense" : "Add expense"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payroll">Payroll</SelectItem>
                  <SelectItem value="facilities">Facilities</SelectItem>
                  <SelectItem value="supplies">Supplies</SelectItem>
                  <SelectItem value="software">Software</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Classroom supplies" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveExpense} disabled={savingExpense}>{savingExpense ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
