import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import {
  FileBarChart,
  Printer,
  Download,
  GraduationCap,
  CalendarCheck,
  AlertCircle,
  Clock,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { RoleLayout } from "@/components/layout/RoleLayout";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState, LoadingStats, LoadingRows } from "@/components/common/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authedApi, downloadCsv } from "@/lib/authedApi";
import { cn } from "@/lib/utils";

interface WorkItem {
  assignmentId: string;
  title: string;
  courseId: string;
  courseTitle: string | null;
  dueDate: string | null;
  extended: boolean;
  submittedAt: string | null;
  minutesLate: number;
  latePenaltyPercent: number;
}

interface ProgressReport {
  generatedAt: string;
  scope: "full" | "teacher";
  student: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    uniqueStudentId: string | null;
    schoolName: string | null;
  };
  summary: {
    averageGrade: number | null;
    attendancePercent: number | null;
    attendance: { present: number; absent: number; late: number; total: number };
    missingCount: number;
    lateCount: number;
    lastLoginAt: string | null;
    flags: { rule: string; label: string }[];
  };
  courses: {
    courseId: string;
    courseTitle: string;
    teacherName: string | null;
    gradePercent: number | null;
    letterGrade: string | null;
    attendancePercent: number | null;
    assignmentsPublished: number;
    assignmentsSubmitted: number;
    missingCount: number;
    lateCount: number;
    quizzesTaken: number;
    completionPercent: number | null;
  }[];
  missingWork: WorkItem[];
  lateWork: WorkItem[];
  recentActivity: { type: string; description: string; at: string }[];
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
const dt = (v: string | null | undefined, f = "MMM d, yyyy") => (v ? format(new Date(v), f) : "—");
const daysLate = (mins: number) => Math.max(1, Math.ceil(mins / 1440));

function gradeTone(v: number | null) {
  if (v === null) return "text-muted-foreground";
  if (v >= 80) return "text-success";
  if (v >= 70) return "text-warning";
  return "text-destructive";
}

/** Hides app chrome when printing so the report prints on its own. */
const PRINT_CSS = `
@media print {
  aside, header, nav, [data-print-hide], .fixed { display: none !important; }
  html, body { background: #fff !important; }
  main { padding: 0 !important; margin: 0 !important; overflow: visible !important; }
  [data-report] { max-width: none !important; }
  [data-report] .rounded-lg, [data-report] .rounded-xl { box-shadow: none !important; }
  [data-report] section, [data-report] tr { break-inside: avoid; }
}
`;

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 print:hidden">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-xl font-bold", tone)}>{value}</p>
      </div>
    </div>
  );
}

function WorkTable({ items, kind }: { items: WorkItem[]; kind: "missing" | "late" }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{kind === "missing" ? "No missing work." : "No late work."}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Assignment</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Due</TableHead>
            {kind === "late" && <TableHead>Late</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((w) => (
            <TableRow key={w.assignmentId}>
              <TableCell className="font-medium">{w.title}</TableCell>
              <TableCell>{w.courseTitle ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">
                {dt(w.dueDate)}
                {w.extended && <span className="ml-1 text-xs text-muted-foreground">(extended)</span>}
              </TableCell>
              {kind === "late" && (
                <TableCell className="whitespace-nowrap">
                  {daysLate(w.minutesLate)}d
                  {w.latePenaltyPercent > 0 && <span className="text-warning"> · −{w.latePenaltyPercent}%</span>}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function StudentProgressReport() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const id = params.id ?? "me";
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authedApi<ProgressReport>(`/students/${encodeURIComponent(id)}/progress-report`)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError(err.message || "Could not load the report"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const exportCsv = () => {
    if (!report) return;
    const r = report;
    const rows: (string | number | null)[][] = [
      ["Progress report", r.student.name],
      ["Student ID", r.student.uniqueStudentId],
      ["School", r.student.schoolName],
      ["Generated", r.generatedAt],
      [],
      ["Summary"],
      ["Average grade %", r.summary.averageGrade],
      ["Attendance %", r.summary.attendancePercent],
      ["Missing assignments", r.summary.missingCount],
      ["Late submissions", r.summary.lateCount],
      ["Last login", r.summary.lastLoginAt],
      [],
      ["Course", "Teacher", "Grade %", "Letter", "Attendance %", "Submitted", "Published", "Missing", "Late", "Quizzes taken", "Completion %"],
      ...r.courses.map((c) => [
        c.courseTitle,
        c.teacherName,
        c.gradePercent,
        c.letterGrade,
        c.attendancePercent,
        c.assignmentsSubmitted,
        c.assignmentsPublished,
        c.missingCount,
        c.lateCount,
        c.quizzesTaken,
        c.completionPercent,
      ]),
      [],
      ["Missing work", "Course", "Due"],
      ...r.missingWork.map((w) => [w.title, w.courseTitle, w.dueDate]),
      [],
      ["Late work", "Course", "Due", "Days late", "Penalty %"],
      ...r.lateWork.map((w) => [w.title, w.courseTitle, w.dueDate, daysLate(w.minutesLate), w.latePenaltyPercent]),
      [],
      ["Recent activity", "When"],
      ...r.recentActivity.map((a) => [a.description, a.at]),
    ];
    const safeName = r.student.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCsv(`progress-report-${safeName}-${format(new Date(), "yyyy-MM-dd")}.csv`, rows);
  };

  const backHref =
    user?.role === "parent"
      ? "/dashboard/parent"
      : user?.role === "admin" || user?.role === "super_admin"
      ? "/dashboard/admin/at-risk"
      : user?.role === "teacher"
      ? "/dashboard/teacher/at-risk"
      : "/dashboard/student";

  return (
    <RoleLayout>
      <style>{PRINT_CSS}</style>
      <div className="space-y-6 max-w-5xl mx-auto" data-report>
        <div data-print-hide>
          <PageHeader
            icon={FileBarChart}
            backHref={backHref}
            title={report ? `Progress report: ${report.student.name}` : "Progress report"}
            description={report?.scope === "teacher" ? "Showing the courses you teach this student." : "Grades, attendance, missing/late work and recent activity."}
            actions={
              report && (
                <>
                  <Button variant="outline" size="sm" onClick={exportCsv}>
                    <Download className="h-4 w-4 mr-1.5" /> CSV
                  </Button>
                  <Button size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1.5" /> Print
                  </Button>
                </>
              )
            }
          />
        </div>

        {loading ? (
          <>
            <LoadingStats />
            <LoadingRows rows={4} />
          </>
        ) : error || !report ? (
          <EmptyState icon={AlertCircle} title="Report unavailable" description={error ?? "Not found"} />
        ) : (
          <>
            {/* Print header */}
            <div className="hidden print:block border-b-2 border-black pb-3">
              <p className="text-xs uppercase tracking-wider">{report.student.schoolName ?? "SolomonQuest"}</p>
              <h1 className="text-2xl font-bold">Progress report — {report.student.name}</h1>
              <p className="text-xs">
                {report.student.uniqueStudentId ? `Student ID ${report.student.uniqueStudentId} · ` : ""}
                Generated {dt(report.generatedAt, "MMMM d, yyyy h:mm a")}
              </p>
            </div>

            {report.summary.flags.length > 0 && (
              <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex gap-2 items-start" role="note">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">Needs attention</p>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">
                    {report.summary.flags.map((f) => (
                      <li key={f.rule}>{f.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat icon={GraduationCap} label="Average grade" value={pct(report.summary.averageGrade)} tone={gradeTone(report.summary.averageGrade)} />
              <Stat icon={CalendarCheck} label="Attendance" value={pct(report.summary.attendancePercent)} />
              <Stat icon={AlertCircle} label="Missing work" value={String(report.summary.missingCount)} tone={report.summary.missingCount ? "text-destructive" : undefined} />
              <Stat icon={Clock} label="Late submissions" value={String(report.summary.lateCount)} tone={report.summary.lateCount ? "text-warning" : undefined} />
            </div>

            <section className="min-w-0">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Courses</CardTitle>
                </CardHeader>
                <CardContent>
                  {report.courses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Not enrolled in any courses.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Course</TableHead>
                            <TableHead className="text-right">Grade</TableHead>
                            <TableHead className="text-right">Attendance</TableHead>
                            <TableHead className="text-right">Submitted</TableHead>
                            <TableHead className="text-right">Missing</TableHead>
                            <TableHead className="text-right">Late</TableHead>
                            {/* Course completion % (modules/lessons) slots in here once available. */}
                            {report.courses.some((c) => c.completionPercent !== null) && (
                              <TableHead className="text-right">Completion</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.courses.map((c) => (
                            <TableRow key={c.courseId}>
                              <TableCell>
                                <p className="font-medium">{c.courseTitle}</p>
                                {c.teacherName && <p className="text-xs text-muted-foreground">{c.teacherName}</p>}
                              </TableCell>
                              <TableCell className={cn("text-right font-semibold whitespace-nowrap", gradeTone(c.gradePercent))}>
                                {pct(c.gradePercent)} {c.letterGrade && <span className="text-xs">({c.letterGrade})</span>}
                              </TableCell>
                              <TableCell className="text-right">{pct(c.attendancePercent)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {c.assignmentsSubmitted}/{c.assignmentsPublished}
                              </TableCell>
                              <TableCell className="text-right">{c.missingCount}</TableCell>
                              <TableCell className="text-right">{c.lateCount}</TableCell>
                              {report.courses.some((x) => x.completionPercent !== null) && (
                                <TableCell className="text-right">{pct(c.completionPercent)}</TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <div className="grid gap-6 lg:grid-cols-2 [&>section]:min-w-0">
              <section>
                <Card className="h-full">
                  <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                    <CardTitle className="text-base">Missing work</CardTitle>
                    <Badge variant="outline">{report.missingWork.length}</Badge>
                  </CardHeader>
                  <CardContent>
                    <WorkTable items={report.missingWork} kind="missing" />
                  </CardContent>
                </Card>
              </section>
              <section>
                <Card className="h-full">
                  <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                    <CardTitle className="text-base">Late work</CardTitle>
                    <Badge variant="outline">{report.lateWork.length}</Badge>
                  </CardHeader>
                  <CardContent>
                    <WorkTable items={report.lateWork} kind="late" />
                  </CardContent>
                </Card>
              </section>
            </div>

            <section>
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                  <Activity className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Recent activity</CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Attendance: {report.summary.attendance.present} present · {report.summary.attendance.late} late ·{" "}
                    {report.summary.attendance.absent} absent
                  </span>
                </CardHeader>
                <CardContent>
                  {report.recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent activity.</p>
                  ) : (
                    <ul className="divide-y">
                      {report.recentActivity.map((a, i) => (
                        <li key={i} className="py-2 flex items-center justify-between gap-3 text-sm">
                          <span>{a.description}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap" title={dt(a.at, "PPpp")}>
                            {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {report.summary.lastLoginAt && (
                    <p className="text-xs text-muted-foreground mt-3">Last signed in {dt(report.summary.lastLoginAt, "MMM d, yyyy h:mm a")}</p>
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </RoleLayout>
  );
}
