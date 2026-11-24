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
  Trash2,
  Pencil,
  Receipt,
} from "lucide-react";
import { EmptyState } from "@/components/common/States";
import { HelpLink } from "@/help/components/HelpLink";
import { StudentBalancesTab } from "@/components/accounting/StudentBalancesTab";
import { PaymentInstructionsCard } from "@/components/accounting/PaymentInstructionsCard";

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
  tuitionCollectedCents?: number;
  refundsCents?: number;
  discountsCents?: number;
  expensesByCategory: { category: string; amountCents: number }[];
  /** Tuition vs "Application fees" (older servers don't send it). */
  revenueByCategory?: { category: string; amountCents: number }[];
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

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Local calendar dates: `new Date(y, m, 1).toISOString()` shifts to the
// previous day for anyone east of UTC.
function defaultRange() {
  const now = new Date();
  return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: ymd(now) };
}

const EXPENSE_CATEGORIES = ["payroll", "facilities", "supplies", "software", "marketing", "other"];

export default function AdminAccounting() {
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState(defaultRange());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState({ category: "other", description: "", amount: "", date: new Date().toISOString().slice(0, 10) });
  const [savingExpense, setSavingExpense] = useState(false);

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
      const cat = categoryFilter !== "all" ? `&category=${encodeURIComponent(categoryFilter)}` : "";
      const res = await apiFetch(`/api/accounting/expenses?from=${range.from}&to=${range.to}${cat}`);
      if (res.ok) setExpenses(await res.json());
    } finally {
      setExpensesLoading(false);
    }
  }, [range.from, range.to, categoryFilter]);

  useEffect(() => {
    fetchSummary();
    fetchExpenses();
  }, [fetchSummary, fetchExpenses]);

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Accounting
            </h1>
            <p className="text-muted-foreground text-sm">Tuition received, expenses, student balances and reminders in one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HelpLink slug="admin-accounting" label="How accounting works" />
            <Button variant="outline" size="sm" onClick={() => apiDownload(`/api/accounting/export/payments?from=${range.from}&to=${range.to}`, "tuition-ledger.csv")}>
              <Download className="h-4 w-4 mr-1.5" />
              Export payments (ledger)
            </Button>
            <Button variant="outline" size="sm" onClick={() => apiDownload(`/api/accounting/export/expenses?from=${range.from}&to=${range.to}`, "expenses.csv")}>
              <Download className="h-4 w-4 mr-1.5" />
              Export expenses
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList>
              <TabsTrigger value="overview">Overview (P&amp;L)</TabsTrigger>
              <TabsTrigger value="students">Student Balances</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="settings">Payment settings</TabsTrigger>
            </TabsList>
          </div>

          {(tab === "overview" || tab === "expenses") && (
            <div className="flex flex-wrap items-end gap-3 mt-4" data-testid="date-range">
              <div>
                <Label htmlFor="acc-from">From</Label>
                <Input id="acc-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} className="w-[160px]" />
              </div>
              <div>
                <Label htmlFor="acc-to">To</Label>
                <Input id="acc-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} className="w-[160px]" />
              </div>
              {tab === "expenses" && (
                <div>
                  <Label htmlFor="acc-cat">Category</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger id="acc-cat" className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c[0].toUpperCase() + c.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

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
                        <TrendingUp className="h-4 w-4 text-success" /> Tuition revenue
                      </div>
                      <div className="text-2xl font-bold text-success tabular-nums" data-testid="pl-revenue">{money(summary.revenueCents)}</div>
                      {summary.revenueByCategory && summary.revenueByCategory.some((c) => c.amountCents > 0) && (
                        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground" data-testid="revenue-by-category">
                          {summary.revenueByCategory.map((c) => (
                            <li key={c.category} className="flex justify-between gap-2">
                              <span>{c.category}</span>
                              <span className="tabular-nums">{money(c.amountCents)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {(summary.refundsCents ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Tuition: {money(summary.tuitionCollectedCents ?? summary.revenueCents)} collected − {money(summary.refundsCents ?? 0)} refunded
                        </p>
                      )}
                      {(summary.discountsCents ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">{money(summary.discountsCents ?? 0)} in discounts and waivers (not revenue)</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingDown className="h-4 w-4 text-destructive" /> Expenses
                      </div>
                      <div className="text-2xl font-bold text-destructive tabular-nums">{money(summary.expensesCents)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="h-4 w-4 text-primary" /> Net
                      </div>
                      <div className={`text-2xl font-bold tabular-nums ${summary.netCents >= 0 ? "text-success" : "text-destructive"}`}>{money(summary.netCents)}</div>
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
                                <div className="h-2 rounded-full bg-success" style={{ width: `${(m.revenueCents / max) * 100}%`, minWidth: m.revenueCents ? "4px" : 0 }} />
                                <span className="text-success tabular-nums">{money(m.revenueCents)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-2 rounded-full bg-destructive" style={{ width: `${(m.expensesCents / max) * 100}%`, minWidth: m.expensesCents ? "4px" : 0 }} />
                                <span className="text-destructive tabular-nums">{money(m.expensesCents)}</span>
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
                  <EmptyState compact icon={Receipt} title="No expenses in this range" description="Add an expense to see it in your P&L." />
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
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
                          <TableCell className="text-destructive font-medium text-right tabular-nums">{money(e.amountCents)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{e.createdByName || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button aria-label="Edit" variant="ghost" size="icon" onClick={() => openEditExpense(e)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button aria-label="Delete" variant="ghost" size="icon" onClick={() => deleteExpense(e.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="students" className="mt-4">
            <StudentBalancesTab onDataChanged={fetchSummary} onOpenSettings={() => setTab("settings")} />
          </TabsContent>

          <TabsContent value="settings" className="mt-4 max-w-2xl">
            <PaymentInstructionsCard />
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
              <Label htmlFor="adminaccounting-category">Category</Label>
              <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger id="adminaccounting-category">
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
              <Label htmlFor="adminaccounting-description">Description</Label>
              <Input id="adminaccounting-description" value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Classroom supplies" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="adminaccounting-amount">Amount ($)</Label>
                <Input id="adminaccounting-amount" type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="adminaccounting-date">Date</Label>
                <Input id="adminaccounting-date" type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} />
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
