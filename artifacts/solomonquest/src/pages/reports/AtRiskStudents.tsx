import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Settings2, Loader2, FileBarChart, ShieldCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { RoleLayout } from "@/components/layout/RoleLayout";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState, LoadingRows } from "@/components/common/States";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authedApi, downloadCsv } from "@/lib/authedApi";
import { cn } from "@/lib/utils";

type RiskRule = "grade" | "attendance" | "missing_late" | "inactive";

interface Thresholds {
  minGradePercent: number;
  minAttendancePercent: number;
  maxMissingOrLate: number;
  inactiveDays: number;
  stored?: boolean;
}

interface AtRiskStudent {
  studentId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  flags: { rule: RiskRule; label: string }[];
  averageGrade: number | null;
  attendancePercent: number | null;
  recentMissingCount: number;
  recentLateCount: number;
  lastLoginAt: string | null;
  courses: { courseId: string; courseTitle: string; gradePercent: number | null }[];
}

interface AtRiskResponse {
  thresholds: Thresholds;
  recentWindowDays: number;
  totalStudents: number;
  courses: { id: string; title: string }[];
  students: AtRiskStudent[];
}

const RULE_LABEL: Record<RiskRule, string> = {
  grade: "Low grade",
  attendance: "Low attendance",
  missing_late: "Missing / late work",
  inactive: "Inactive",
};

const RULE_STYLE: Record<RiskRule, string> = {
  grade: "border-destructive/40 text-destructive bg-destructive/5",
  attendance: "border-warning/50 text-warning bg-warning/10",
  missing_late: "border-primary/30 text-primary bg-primary/5",
  inactive: "border-border text-muted-foreground bg-muted/40",
};

function ThresholdsDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Thresholds;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    minGradePercent: String(initial.minGradePercent),
    minAttendancePercent: String(initial.minAttendancePercent),
    maxMissingOrLate: String(initial.maxMissingOrLate),
    inactiveDays: String(initial.inactiveDays),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        minGradePercent: String(initial.minGradePercent),
        minAttendancePercent: String(initial.minAttendancePercent),
        maxMissingOrLate: String(initial.maxMissingOrLate),
        inactiveDays: String(initial.inactiveDays),
      });
    }
  }, [open, initial]);

  const save = async () => {
    setSaving(true);
    try {
      await authedApi("/at-risk/settings", {
        method: "PUT",
        body: JSON.stringify({
          minGradePercent: Number(form.minGradePercent),
          minAttendancePercent: Number(form.minAttendancePercent),
          maxMissingOrLate: Number(form.maxMissingOrLate),
          inactiveDays: Number(form.inactiveDays),
        }),
      });
      toast.success("Thresholds saved");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Could not save thresholds");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, hint: string, props: { min: number; max: number; step?: string }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`th-${key}`}>{label}</Label>
      <Input
        id={`th-${key}`}
        type="number"
        {...props}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>At-risk thresholds</DialogTitle>
          <DialogDescription>A student is flagged when any rule below matches. Applies to your whole school.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("minGradePercent", "Average grade below (%)", "Default 70", { min: 0, max: 100 })}
          {field("minAttendancePercent", "Attendance below (%)", "Default 80", { min: 0, max: 100 })}
          {field("maxMissingOrLate", "Missing or late (count)", "In the last 14 days. Default 2", { min: 1, max: 100, step: "1" })}
          {field("inactiveDays", "No login for (days)", "Default 14", { min: 1, max: 365, step: "1" })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AtRiskStudents() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [data, setData] = useState<AtRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [ruleFilter, setRuleFilter] = useState<RiskRule | "">("");
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await authedApi<AtRiskResponse>(`/at-risk${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`));
    } catch (err: any) {
      setError(err.message || "Could not load at-risk students");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const students = (data?.students ?? []).filter((s) => !ruleFilter || s.flags.some((f) => f.rule === ruleFilter));
  const countByRule = (rule: RiskRule) => (data?.students ?? []).filter((s) => s.flags.some((f) => f.rule === rule)).length;

  const exportCsv = () => {
    downloadCsv("at-risk-students.csv", [
      ["Student", "Email", "Flags", "Average grade %", "Attendance %", "Missing (14d)", "Late (14d)", "Last login"],
      ...students.map((s) => [
        s.name,
        s.email,
        s.flags.map((f) => f.label).join("; "),
        s.averageGrade,
        s.attendancePercent,
        s.recentMissingCount,
        s.recentLateCount,
        s.lastLoginAt,
      ]),
    ]);
  };

  const t = data?.thresholds;

  return (
    <RoleLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <PageHeader
          icon={AlertTriangle}
          title="At-risk students"
          description={
            isAdmin
              ? "Students across your school who match one or more early-warning rules."
              : "Students in your courses who match one or more early-warning rules."
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!students.length}>
                <Download className="h-4 w-4 mr-1.5" /> CSV
              </Button>
              {isAdmin && t && (
                <Button size="sm" onClick={() => setEditOpen(true)}>
                  <Settings2 className="h-4 w-4 mr-1.5" /> Thresholds
                </Button>
              )}
            </>
          }
        />

        {t && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rules</CardTitle>
              <CardDescription className="text-xs">
                Click a rule to filter. {t.stored ? "Custom thresholds for your school." : "Default thresholds."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {(
                [
                  ["grade", `Average grade < ${t.minGradePercent}%`],
                  ["attendance", `Attendance < ${t.minAttendancePercent}%`],
                  ["missing_late", `${t.maxMissingOrLate}+ missing/late in ${data?.recentWindowDays ?? 14} days`],
                  ["inactive", `No login in ${t.inactiveDays} days`],
                ] as [RiskRule, string][]
              ).map(([rule, text]) => (
                <button
                  key={rule}
                  type="button"
                  onClick={() => setRuleFilter((r) => (r === rule ? "" : rule))}
                  aria-pressed={ruleFilter === rule}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    ruleFilter === rule ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"
                  )}
                >
                  <p className="text-2xl font-bold">{countByRule(rule)}</p>
                  <p className="text-xs font-medium">{RULE_LABEL[rule]}</p>
                  <p className="text-[11px] text-muted-foreground">{text}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {data && data.courses.length > 1 && (
            <Select value={courseId || "__all__"} onValueChange={(v) => setCourseId(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-72" aria-label="Filter by course">
                <SelectValue placeholder="All courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All courses</SelectItem>
                {data.courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {data && (
            <p className="text-sm text-muted-foreground sm:ml-auto">
              {data.students.length} of {data.totalStudents} student{data.totalStudents === 1 ? "" : "s"} flagged
            </p>
          )}
        </div>

        {loading ? (
          <LoadingRows rows={5} />
        ) : error ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load at-risk students" description={error} action={<Button onClick={load}>Try again</Button>} />
        ) : students.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={ruleFilter ? "No students match this rule" : "No students are flagged"}
            description="Everyone is above your thresholds right now."
          />
        ) : (
          <ul className="space-y-3" data-testid="at-risk-list">
            {students.map((s) => (
              <li key={s.studentId}>
                <Card>
                  <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex items-center gap-3 min-w-0 md:w-64">
                      <Avatar className="h-9 w-9 border shrink-0">
                        <AvatarImage src={s.avatarUrl || ""} />
                        <AvatarFallback>{s.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.courses.map((c) => c.courseTitle).join(", ") || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {s.flags.map((f) => (
                        <Badge key={f.rule} variant="outline" className={cn("text-xs font-normal", RULE_STYLE[f.rule])}>
                          {f.label}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-4 md:justify-end">
                      <dl className="grid grid-cols-3 gap-3 text-center text-xs">
                        <div>
                          <dt className="text-muted-foreground">Grade</dt>
                          <dd className="font-semibold">{s.averageGrade != null ? `${s.averageGrade}%` : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Attend.</dt>
                          <dd className="font-semibold">{s.attendancePercent != null ? `${s.attendancePercent}%` : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Login</dt>
                          <dd className="font-semibold whitespace-nowrap">
                            {s.lastLoginAt ? formatDistanceToNow(new Date(s.lastLoginAt), { addSuffix: false }) : "90d+"}
                          </dd>
                        </div>
                      </dl>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/reports/students/${s.studentId}`}>
                          <FileBarChart className="h-4 w-4 mr-1.5" /> Report
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isAdmin && t && <ThresholdsDialog open={editOpen} onOpenChange={setEditOpen} initial={t} onSaved={load} />}
    </RoleLayout>
  );
}
