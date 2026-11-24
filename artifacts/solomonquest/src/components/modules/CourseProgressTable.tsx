import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Search, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingRows } from "@/components/common/States";
import { modulesApi, progressKey, type StudentProgressRow } from "./api";

function name(r: StudentProgressRow) {
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Student";
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Per-student module completion for teachers / admins. */
export function CourseProgressTable({ courseId }: { courseId: string }) {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery<{ courseId: string; students: StudentProgressRow[] }>({
    queryKey: progressKey(courseId),
    queryFn: () => modulesApi(`/courses/${courseId}/progress`),
    enabled: !!courseId,
  });
  const rows = data?.students ?? [];
  const filtered = useMemo(
    () => rows.filter((r) => `${name(r)} ${r.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
    [rows, q]
  );
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / rows.length) : 0;
  const finished = rows.filter((r) => r.completedAt).length;

  return (
    <Card data-testid="progress-table">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="font-serif text-xl">Student progress</CardTitle>
            <CardDescription>
              Completion across published modules: lessons marked complete, assignments submitted, quizzes attempted.
            </CardDescription>
          </div>
          {rows.length > 0 && (
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Average</p>
                <p className="font-semibold">{avg}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="font-semibold">{finished} / {rows.length}</p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingRows rows={3} />
        ) : error ? (
          <EmptyState compact icon={TrendingUp} title="Progress couldn't load" description={(error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState compact icon={TrendingUp} title="No enrolled students" description="Progress appears here once students are enrolled." />
        ) : (
          <div className="space-y-3">
            {rows.length > 6 && (
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="pl-8" aria-label="Search students" />
              </div>
            )}
            {/* Phone: stacked list */}
            <ul className="space-y-2 sm:hidden">
              {filtered.map((r) => (
                <li key={r.studentId} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{name(r)}</p>
                    <span className="text-sm font-semibold tabular-nums">{r.percent}%</span>
                  </div>
                  <Progress value={r.percent} className="mt-2 h-1.5" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.completedItems} of {r.totalItems} items
                    {r.completedAt ? ` · completed ${formatDate(r.completedAt)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-[40%]">Progress</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.studentId}>
                      <TableCell>
                        <p className="font-medium">{name(r)}</p>
                        {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Progress value={r.percent} className="h-2" />
                          <span className="w-10 text-right text-sm font-semibold tabular-nums">{r.percent}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.completedItems}/{r.totalItems}</TableCell>
                      <TableCell className="text-right">
                        {r.completedAt ? (
                          <Badge className="gap-1 bg-success/10 text-success border border-success/30">
                            <CheckCircle2 className="h-3 w-3" /> {formatDate(r.completedAt)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
