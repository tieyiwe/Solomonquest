import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Bell, Download, Plus, Search, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { apiFetch, apiJson, day, money, STATUS_LABEL, STATUS_STYLE, type BalanceStatus, type CurrencyTotals } from "./shared";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { StudentLedgerSheet } from "./StudentLedgerSheet";
import { BulkRemindDialog } from "./BulkRemindDialog";

export interface BalanceRow {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  status: BalanceStatus;
  isOverdue: boolean;
  currency: string;
  totalBilledCents: number;
  totalPaidCents: number;
  totalDiscountCents: number;
  balanceCents: number;
  creditCents: number;
  overdueCents: number;
  otherCurrencies: CurrencyTotals[];
  nextDueDate: string | null;
  nextDueAmountCents: number | null;
  lastPaymentAt: string | null;
  lastRemindedAt: string | null;
  plans: { paymentId: string; label: string; currency: string }[];
}

interface BalancesResponse {
  rows: BalanceRow[];
  counts: { all: number; paid: number; partial: number; owing: number; overdue: number; withBalance: number };
  facets: { programs: { id: string; name: string }[]; courses: { id: string; title: string }[] };
  onlinePayments: boolean;
  hasPaymentInstructions: boolean;
  legacy: boolean;
}

function relTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : day(iso);
}

export function StudentBalancesTab({ onDataChanged, onOpenSettings }: { onDataChanged?: () => void; onOpenSettings?: () => void }) {
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [programId, setProgramId] = useState("all");
  const [courseId, setCourseId] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [minOwed, setMinOwed] = useState("");
  const [maxOwed, setMaxOwed] = useState("");
  const [sort, setSort] = useState("balance_desc");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [recordFor, setRecordFor] = useState<BalanceRow | null>(null);
  const [remind, setRemind] = useState<{ ids: string[]; title: string } | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status !== "all") p.set("status", status);
    if (programId !== "all") p.set("programId", programId);
    if (courseId !== "all") p.set("courseId", courseId);
    if (overdueOnly) p.set("overdue", "true");
    if (minOwed.trim()) p.set("minOwed", minOwed.trim());
    if (maxOwed.trim()) p.set("maxOwed", maxOwed.trim());
    p.set("sort", sort);
    return p.toString();
  }, [q, status, programId, courseId, overdueOnly, minOwed, maxOwed, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiJson<BalancesResponse>(`/api/accounting/balances?${query}`));
    } catch (e: any) {
      toast.error(e.message || "Couldn't load balances");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, q || minOwed || maxOwed ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q, minOwed, maxOwed]);

  const rows = data?.rows ?? [];
  useEffect(() => {
    // Drop selections that the current filter hides.
    setSelected((prev) => new Set(Array.from(prev).filter((id) => rows.some((r) => r.studentId === id))));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const owingIds = rows.filter((r) => r.balanceCents > 0).map((r) => r.studentId);
  const overdueIds = rows.filter((r) => r.isOverdue).map((r) => r.studentId);
  const selectedOwing = Array.from(selected).filter((id) => owingIds.includes(id));
  const outstandingTotal = rows.reduce((s, r) => s + r.balanceCents, 0);
  const overdueTotal = rows.reduce((s, r) => s + r.overdueCents, 0);
  const currency = rows[0]?.currency ?? "usd";
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.studentId));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = async () => {
    const res = await apiFetch(`/api/accounting/export/balances?${query}`);
    if (!res.ok) {
      toast.error("Export failed");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "student-balances.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const changed = () => {
    load();
    onDataChanged?.();
  };

  return (
    <div className="space-y-4">
      {data?.legacy && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          The tuition ledger isn't set up yet, so balances come from installment statuses and payments can't be recorded here. Ask your platform admin to run tuition-ledger.sql.
        </div>
      )}
      {data && !data.onlinePayments && !data.hasPaymentInstructions && (
        <div className="rounded-md border p-3 text-sm flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[200px]">Online payment isn't connected. Add payment instructions (bank details, where to pay cash) so students and reminders say how to pay.</span>
          {onOpenSettings && <Button size="sm" variant="outline" onClick={onOpenSettings}>Set payment instructions</Button>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Students shown" value={String(rows.length)} />
        <MiniStat label="Outstanding" value={money(outstandingTotal, currency)} tone="text-destructive" />
        <MiniStat label="Overdue" value={money(overdueTotal, currency)} tone={overdueTotal ? "text-destructive" : ""} />
        <MiniStat label="Owing / overdue" value={`${owingIds.length} / ${overdueIds.length}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search by name or email" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses ({data?.counts.all ?? 0})</SelectItem>
            <SelectItem value="overdue">Overdue ({data?.counts.overdue ?? 0})</SelectItem>
            <SelectItem value="owing">Owing ({data?.counts.owing ?? 0})</SelectItem>
            <SelectItem value="partial">Partially paid ({data?.counts.partial ?? 0})</SelectItem>
            <SelectItem value="paid">Paid in full ({data?.counts.paid ?? 0})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[190px]" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="balance_desc">Balance: highest first</SelectItem>
            <SelectItem value="balance_asc">Balance: lowest first</SelectItem>
            <SelectItem value="due_asc">Next due: soonest first</SelectItem>
            <SelectItem value="due_desc">Next due: latest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          <SlidersHorizontal className="h-4 w-4 mr-1.5" />More filters
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div>
              <Label htmlFor="bf-program">Program</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger id="bf-program"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs</SelectItem>
                  {(data?.facets.programs ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="bf-course">Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="bf-course"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All courses</SelectItem>
                  {(data?.facets.courses ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="bf-min">Owes at least</Label>
              <Input id="bf-min" inputMode="decimal" placeholder="0.00" value={minOwed} onChange={(e) => setMinOwed(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bf-max">Owes at most</Label>
              <Input id="bf-max" inputMode="decimal" placeholder="Any" value={maxOwed} onChange={(e) => setMaxOwed(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm h-10 cursor-pointer">
              <Checkbox checked={overdueOnly} onCheckedChange={(v) => setOverdueOnly(v === true)} aria-label="Overdue only" />
              Overdue only
            </label>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="bulk-bar">
        <Button size="sm" disabled={selectedOwing.length === 0} onClick={() => setRemind({ ids: selectedOwing, title: `Remind ${selectedOwing.length} selected` })}>
          <Bell className="h-4 w-4 mr-1.5" />Remind selected ({selectedOwing.length})
        </Button>
        <Button size="sm" variant="outline" disabled={owingIds.length === 0} onClick={() => setRemind({ ids: owingIds, title: `Remind all owing (${owingIds.length})` })}>
          Remind all owing ({owingIds.length})
        </Button>
        <Button size="sm" variant="outline" disabled={overdueIds.length === 0} onClick={() => setRemind({ ids: overdueIds, title: `Remind all overdue (${overdueIds.length})` })}>
          Remind all overdue ({overdueIds.length})
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1.5" />Export balances
        </Button>
      </div>

      {loading && !data ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No students match these filters.</CardContent></Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox aria-label="Select all shown" checked={allSelected} onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.studentId)) : new Set())} />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid / discounts</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.studentId} data-testid="balance-row" data-student={r.studentId}>
                      <TableCell>
                        <Checkbox aria-label={`Select ${r.studentName}`} checked={selected.has(r.studentId)} onCheckedChange={() => toggle(r.studentId)} />
                      </TableCell>
                      <TableCell>
                        <button className="text-left font-medium hover:underline" onClick={() => setOpenStudent(r.studentId)}>{r.studentName}</button>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{r.studentEmail}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{r.plans.map((p) => p.label).join(", ")}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.totalBilledCents, r.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-success">{money(r.totalPaidCents, r.currency)}</span>
                        {r.totalDiscountCents > 0 && <div className="text-xs text-muted-foreground">{money(r.totalDiscountCents, r.currency)} off</div>}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${r.balanceCents > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`} data-testid="balance-outstanding">
                        {money(r.balanceCents, r.currency)}
                        {r.creditCents > 0 && <div className="text-xs text-success">credit {money(r.creditCents, r.currency)}</div>}
                        {r.otherCurrencies.filter((o) => o.outstandingCents > 0).map((o) => <div key={o.currency} className="text-xs">+ {money(o.outstandingCents, o.currency)}</div>)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.nextDueDate ? (
                          <span className={r.isOverdue ? "text-destructive" : ""}>{day(r.nextDueDate)}<br /><span className="text-xs text-muted-foreground">{money(r.nextDueAmountCents, r.currency)}</span></span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <div>Paid {r.lastPaymentAt ? day(r.lastPaymentAt) : "never"}</div>
                        <div>Reminded {relTime(r.lastRemindedAt).toLowerCase()}</div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap space-x-1">
                        <Button size="sm" variant="outline" className="px-2" onClick={() => setRecordFor(r)} aria-label={`Record payment for ${r.studentName}`} title="Record payment">
                          <Plus className="h-3.5 w-3.5" /><span className="sr-only">Payment</span>
                        </Button>
                        {r.balanceCents > 0 && (
                          <Button size="sm" variant="outline" className="px-2" title="Send balance reminder" onClick={() => setRemind({ ids: [r.studentId], title: `Remind ${r.studentName}` })} aria-label={`Remind ${r.studentName}`}>
                            <Bell className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Phone cards */}
          <div className="md:hidden space-y-3">
            <label className="flex items-center gap-2 text-sm px-1">
              <Checkbox aria-label="Select all shown" checked={allSelected} onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.studentId)) : new Set())} />
              Select all shown
            </label>
            {rows.map((r) => (
              <Card key={r.studentId} data-testid="balance-card" data-student={r.studentId}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Checkbox className="mt-1" aria-label={`Select ${r.studentName}`} checked={selected.has(r.studentId)} onCheckedChange={() => toggle(r.studentId)} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpenStudent(r.studentId)}>
                      <p className="font-medium truncate">{r.studentName}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.studentEmail}</p>
                    </button>
                    <Badge variant="outline" className={`${STATUS_STYLE[r.status]} shrink-0`}>{STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-xs text-muted-foreground">Billed</p><p className="tabular-nums">{money(r.totalBilledCents, r.currency)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Paid</p><p className="tabular-nums text-success">{money(r.totalPaidCents, r.currency)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Owes</p><p className={`tabular-nums font-semibold ${r.balanceCents > 0 ? "text-destructive" : ""}`}>{money(r.balanceCents, r.currency)}</p></div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.nextDueDate ? <>Next {money(r.nextDueAmountCents, r.currency)} {r.isOverdue ? "was due" : "due"} {day(r.nextDueDate)}</> : "Nothing due"}
                    {" · "}Last paid {day(r.lastPaymentAt)}{" · "}Reminded {relTime(r.lastRemindedAt).toLowerCase()}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setRecordFor(r)}><Plus className="h-3.5 w-3.5 mr-1" />Payment</Button>
                    {r.balanceCents > 0 && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setRemind({ ids: [r.studentId], title: `Remind ${r.studentName}` })}><Bell className="h-3.5 w-3.5 mr-1" />Remind</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <StudentLedgerSheet
        studentId={openStudent}
        onOpenChange={(o) => !o && setOpenStudent(null)}
        onChanged={changed}
        onRemind={(id) => setRemind({ ids: [id], title: "Send a balance reminder" })}
      />
      <RecordPaymentDialog
        open={!!recordFor}
        onOpenChange={(o) => !o && setRecordFor(null)}
        studentId={recordFor?.studentId ?? null}
        studentName={recordFor?.studentName}
        onRecorded={changed}
      />
      <BulkRemindDialog
        studentIds={remind?.ids ?? null}
        title={remind?.title}
        onOpenChange={(o) => !o && setRemind(null)}
        onSent={() => load()}
      />
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
