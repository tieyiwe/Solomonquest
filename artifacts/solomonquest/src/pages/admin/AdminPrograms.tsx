import { useState, useEffect } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { supabase } from "@/lib/supabase";
import { StudentDetailDialog } from "@/components/StudentDetailDialog";
import {
  useListPrograms,
  useCreateProgram,
  useUpdateProgram,
  useDeleteProgram,
  useListCourses,
  getListProgramsQueryKey,
} from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Layers, Plus, Search, Pencil, Trash2, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Program } from "@workspace/api-client-react";
import { LoadingRows } from "@/components/common/States";
import { CURRENCIES, formatMoney } from "@/lib/admissions";
import { useQuery } from "@tanstack/react-query";

interface ProgramFormData {
  name: string;
  code: string;
  level: string;
  description: string;
  isActive: boolean;
}

const defaultForm: ProgramFormData = {
  name: "",
  code: "",
  level: "",
  description: "",
  isActive: true,
};

interface ProgramRosterStudent {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  courses: { id: string; title: string; code: string | null }[];
}

function ProgramRosterTab({ programId }: { programId: string }) {
  const [students, setStudents] = useState<ProgramRosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/programs/${programId}/students`)
      .then((r) => r.json())
      .then((data) => setStudents(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [programId]);

  if (loading) return <LoadingRows rows={3} />;

  return (
    <div>
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students enrolled in this program's courses yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {students.map((s) => (
            <li key={s.id}>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50"
                onClick={() => setViewStudentId(s.id)}
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                  {`${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}`.toUpperCase() || "S"}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {s.firstName} {s.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.courses.map((c) => c.title).join(", ")}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <StudentDetailDialog
        studentId={viewStudentId}
        open={!!viewStudentId}
        onOpenChange={(v) => { if (!v) setViewStudentId(null); }}
      />
    </div>
  );
}

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
  programId?: string | null;
  amountCents: number;
  currency?: string | null;
  allowFullPayment: boolean;
  allowInstallments: boolean;
  installmentCount: number;
  pricingNote?: string | null;
}

/**
 * The one place a program's price is set: Free, or an amount + currency with
 * full payment and/or installments, plus an optional short note. Saved as
 * the program's tuition plan (POST /tuition-plans); "Free" removes the plan.
 */
function ProgramTuitionTab({ programId, onSaved }: { programId: string; onSaved?: () => void }) {
  const [paid, setPaid] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [note, setNote] = useState("");
  const [allowFull, setAllowFull] = useState(true);
  const [allowInstallments, setAllowInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("2");
  const [existingPlanId, setExistingPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/tuition-plans?programId=${programId}`)
      .then((r) => r.json())
      .then((plans: TuitionPlan[]) => {
        const plan = Array.isArray(plans) ? plans[0] : undefined;
        if (plan) {
          setExistingPlanId(plan.id);
          setPaid(plan.amountCents > 0);
          setAmount(plan.amountCents > 0 ? (plan.amountCents / 100).toFixed(2) : "");
          setCurrency((plan.currency || "usd").toLowerCase());
          setNote(plan.pricingNote ?? "");
          setAllowFull(plan.allowFullPayment);
          setAllowInstallments(plan.allowInstallments);
          setInstallmentCount(String(Math.max(2, plan.installmentCount)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [programId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!paid) {
        // Free = amount 0 on the existing plan, never a delete: deleting a
        // plan cascades to students' past tuition records.
        if (existingPlanId) {
          const res = await apiFetch("/api/tuition-plans", {
            method: "POST",
            body: JSON.stringify({ programId, amountCents: 0, currency, pricingNote: null, allowFullPayment: true, allowInstallments: false, installmentCount: 1 }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to update price");
          }
        }
        toast.success("Program is free");
        onSaved?.();
        return;
      }
      const value = parseFloat(amount);
      if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
        toast.error("Enter a price above 0, or choose Free");
        return;
      }
      if (!allowFull && !allowInstallments) {
        toast.error("Enable at least one payment option");
        return;
      }
      const res = await apiFetch("/api/tuition-plans", {
        method: "POST",
        body: JSON.stringify({
          programId,
          amountCents: Math.round(value * 100),
          currency,
          pricingNote: note.trim() || null,
          allowFullPayment: allowFull,
          allowInstallments,
          installmentCount: Math.max(2, parseInt(installmentCount, 10) || 2),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save price");
      }
      const data = await res.json();
      setExistingPlanId(data.id);
      toast.success("Price saved");
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save price");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingRows rows={3} />;

  return (
    <div className="space-y-4" data-testid="program-price-form">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Program price">
        {[
          { v: false, label: "Free", hint: "No tuition" },
          { v: true, label: "Paid", hint: "Set a price" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={paid === o.v}
            onClick={() => setPaid(o.v)}
            className={`rounded-lg border p-3 text-left transition-colors ${paid === o.v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"}`}
          >
            <p className="text-sm font-medium">{o.label}</p>
            <p className="text-xs text-muted-foreground">{o.hint}</p>
          </button>
        ))}
      </div>

      {paid && (
        <>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="adminprograms-tuition-amount">Price</Label>
              <Input id="adminprograms-tuition-amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adminprograms-tuition-currency">Currency</Label>
              <select
                id="adminprograms-tuition-currency"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminprograms-pricing-note">Pricing note (optional)</Label>
            <Input id="adminprograms-pricing-note" maxLength={200} placeholder="e.g. Includes books and lab materials" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Allow full payment</p>
              <p className="text-xs text-muted-foreground">Pay the whole price at once</p>
            </div>
            <Switch checked={allowFull} onCheckedChange={setAllowFull} aria-label="Allow full payment" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Allow installments</p>
              <p className="text-xs text-muted-foreground">Split it into monthly payments</p>
            </div>
            <Switch checked={allowInstallments} onCheckedChange={setAllowInstallments} aria-label="Allow installments" />
          </div>
          {allowInstallments && (
            <div className="space-y-1.5 pl-3 border-l-2">
              <Label htmlFor="adminprograms-number-of-installments">Number of installments</Label>
              <Input id="adminprograms-number-of-installments" type="number" min="2" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} className="max-w-[120px]" />
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Shown on your school page and the application form. When an application to this program is approved, the
        student gets this tuition on their Tuition page.
      </p>
      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save price
      </Button>
    </div>
  );
}

/** Price shown in the Programs list; opens the price editor. */
function ProgramPriceCell({ plan, onClick }: { plan: TuitionPlan | undefined; onClick: () => void }) {
  const label = plan && plan.amountCents > 0 ? formatMoney(plan.amountCents, plan.currency) : "Free";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-col items-start rounded-md px-2 py-1 -mx-2 text-left hover:bg-muted"
      aria-label={`Price: ${label}. Edit price`}
    >
      <span className={`text-sm font-medium ${plan && plan.amountCents > 0 ? "text-foreground" : "text-success"}`}>{label}</span>
      {plan && plan.amountCents > 0 && plan.allowInstallments && (
        <span className="text-[11px] text-muted-foreground">{plan.allowFullPayment ? "or " : ""}{plan.installmentCount} installments</span>
      )}
      {plan?.pricingNote && <span className="text-[11px] text-muted-foreground line-clamp-1 max-w-[160px]">{plan.pricingNote}</span>}
    </button>
  );
}

function ProgramFormDialog({
  mode,
  program,
  open,
  onOpenChange,
  onPriceSaved,
}: {
  mode: "create" | "edit";
  program?: Program;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPriceSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();

  const [form, setForm] = useState<ProgramFormData>(() =>
    program
      ? {
          name: program.name || "",
          code: program.code || "",
          level: program.level || "",
          description: program.description || "",
          isActive: program.isActive ?? true,
        }
      : defaultForm
  );

  const set = (key: keyof ProgramFormData, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Program name is required");
      return;
    }

    const payload = {
      name: form.name,
      code: form.code || undefined,
      level: form.level || undefined,
      description: form.description || undefined,
      isActive: form.isActive,
    };

    if (mode === "create") {
      createProgram.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast.success("Program created");
            queryClient.invalidateQueries({ queryKey: getListProgramsQueryKey() });
            onOpenChange(false);
            setForm(defaultForm);
          },
          onError: (err: any) => toast.error(err.message || "Failed to create program"),
        }
      );
    } else if (program) {
      updateProgram.mutate(
        { id: program.id, data: payload },
        {
          onSuccess: () => {
            toast.success("Program updated");
            queryClient.invalidateQueries({ queryKey: getListProgramsQueryKey() });
            onOpenChange(false);
          },
          onError: (err: any) => toast.error(err.message || "Failed to update program"),
        }
      );
    }
  };

  const isPending = createProgram.isPending || updateProgram.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create New Program" : "Edit Program"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="adminprograms-program-name">Program Name *</Label>
            <Input id="adminprograms-program-name"
              placeholder="Bachelor of Science in Nursing"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminprograms-description">Description</Label>
            <Textarea id="adminprograms-description"
              placeholder="Brief description of the program..."
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminprograms-program-code">Program Code</Label>
            <Input id="adminprograms-program-code"
              placeholder="BSN"
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminprograms-level">Level</Label>
            <Input id="adminprograms-level"
              placeholder="Undergraduate, Graduate, etc."
              value={form.level}
              onChange={(e) => set("level", e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive programs are hidden from course creation
              </p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
          </div>

          {mode === "edit" && program && (
            <>
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-semibold">Enrolled Students</Label>
                <ProgramRosterTab programId={program.id} />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-semibold">Price</Label>
                <ProgramTuitionTab programId={program.id} onSaved={onPriceSaved} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create Program" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPrograms() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<Program | null>(null);
  const [priceProgram, setPriceProgram] = useState<Program | null>(null);

  // Every program plan for the school, to show each program's price in the list.
  const { data: plans, refetch: refetchPlans } = useQuery<TuitionPlan[]>({
    queryKey: ["program-tuition-plans"],
    queryFn: async () => {
      const res = await apiFetch("/api/tuition-plans");
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    },
  });
  const planByProgram = new Map((plans ?? []).filter((p) => p.programId).map((p) => [p.programId as string, p]));

  const { data: programs, isLoading } = useListPrograms();
  const { data: courses } = useListCourses();
  const deleteProgram = useDeleteProgram();

  const courseCountByProgram = (courses ?? []).reduce<Record<string, number>>((acc, c) => {
    const pid = (c as any).programId as string | null;
    if (pid) acc[pid] = (acc[pid] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = (programs ?? []).filter((p) =>
    `${p.name} ${p.code}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: string, name: string) => {
    deleteProgram.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success(`"${name}" deleted`);
          queryClient.invalidateQueries({ queryKey: getListProgramsQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to delete program"),
      }
    );
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Programs</h1>
            <p className="text-muted-foreground mt-0.5">
              Group courses into a program. Enrolling in one course auto-enrolls students into
              every course in the same program, and gives them a shared program chat.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Program
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search programs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0 divide-y">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-40 mb-1.5" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No programs found</p>
                <p className="text-sm mt-1">
                  {search ? "Try a different search." : "Create your first program to get started."}
                </p>
                {!search && (
                  <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Create Program
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Program</TableHead>
                    <TableHead className="font-semibold">Code & Level</TableHead>
                    <TableHead className="font-semibold">Courses</TableHead>
                    <TableHead className="font-semibold">Price</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((program) => (
                    <TableRow key={program.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Layers className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{program.name}</p>
                            {program.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                {program.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {program.code && (
                            <Badge variant="outline" className="text-xs font-mono">
                              {program.code}
                            </Badge>
                          )}
                          {program.level && (
                            <span className="text-xs text-muted-foreground">{program.level}</span>
                          )}
                          {!program.code && !program.level && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>{courseCountByProgram[program.id] ?? 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProgramPriceCell plan={planByProgram.get(program.id)} onClick={() => setPriceProgram(program)} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            program.isActive
                              ? "bg-success/10 text-success border-success/30 border"
                              : "bg-muted text-muted-foreground border-border border"
                          }
                        >
                          {program.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setEditProgram(program)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/20"
                                disabled={deleteProgram.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Program?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete <strong>{program.name}</strong>?
                                  This action cannot be undone. Move or delete any courses still
                                  assigned to this program first.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive hover:bg-destructive/90"
                                  onClick={() => handleDelete(program.id, program.name)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ProgramFormDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />

      {editProgram && (
        <ProgramFormDialog
          mode="edit"
          program={editProgram}
          open={!!editProgram}
          onOpenChange={(v) => {
            if (!v) setEditProgram(null);
          }}
          onPriceSaved={() => refetchPlans()}
        />
      )}

      <Dialog open={!!priceProgram} onOpenChange={(v) => { if (!v) setPriceProgram(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Price · {priceProgram?.name}</DialogTitle>
          </DialogHeader>
          {priceProgram && (
            <ProgramTuitionTab
              programId={priceProgram.id}
              onSaved={() => {
                refetchPlans();
                setPriceProgram(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
