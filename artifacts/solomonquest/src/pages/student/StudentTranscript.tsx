import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { useQuery } from "@tanstack/react-query";
import { useGetMySchool } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  GraduationCap,
  BookOpen,
  Printer,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TranscriptAssignment {
  id: string;
  title: string;
  grade: number | null;
  pointsPossible: number | null;
  submittedAt: string | null;
  status: string;
}

interface TranscriptCourse {
  id: string;
  title: string;
  code: string | null;
  term: string | null;
  teacherName: string | null;
  assignments: TranscriptAssignment[];
  courseAverage: number | null;
  academicPercent?: number | null;
  attendancePercent?: number | null;
  attendanceWeightPercent?: number;
  letterGrade?: string | null;
}

interface TranscriptData {
  studentName: string;
  studentId: string;
  courses: TranscriptCourse[];
  overallPercent?: number | null;
  gpa?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function percentToGpa(pct: number): number {
  if (pct >= 90) return 4.0;
  if (pct >= 80) return 3.0;
  if (pct >= 70) return 2.0;
  if (pct >= 60) return 1.0;
  return 0.0;
}

function calcCourseAverage(assignments: TranscriptAssignment[]): number | null {
  const valid = assignments
    .filter((a) => a.grade != null && a.pointsPossible)
    .map((a) => (a.grade! / a.pointsPossible!) * 100);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
}

function gradeColor(pct: number | null) {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 90) return "text-green-600";
  if (pct >= 80) return "text-blue-600";
  if (pct >= 70) return "text-amber-600";
  if (pct >= 60) return "text-orange-500";
  return "text-red-600";
}

function letterGrade(pct: number | null): string {
  if (pct == null) return "—";
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

function gpaColor(gpa: number) {
  if (gpa >= 3.5) return "text-green-600";
  if (gpa >= 2.5) return "text-blue-600";
  if (gpa >= 1.5) return "text-amber-600";
  return "text-red-600";
}

async function fetchTranscript(studentId: string): Promise<TranscriptData> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/transcript/${studentId}`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to load transcript (${res.status})`);
  }
  return res.json();
}

// ── Course Card ───────────────────────────────────────────────────────────────

function CourseTranscriptCard({ course }: { course: TranscriptCourse }) {
  const average = course.courseAverage ?? calcCourseAverage(course.assignments);
  const gpa = average != null ? percentToGpa(average) : null;
  const letter = letterGrade(average);
  const gradedCount = course.assignments.filter((a) => a.grade != null).length;

  return (
    <Card className="print:shadow-none print:border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              {course.title}
            </CardTitle>
            <CardDescription className="mt-0.5">
              {[course.code, course.term, course.teacherName ? `Instructor: ${course.teacherName}` : null]
                .filter(Boolean)
                .join(" • ")}
            </CardDescription>
          </div>

          <div className="text-right shrink-0">
            {average != null ? (
              <>
                <div className={cn("text-2xl font-bold", gradeColor(average))}>
                  {letter}
                </div>
                <div className={cn("text-sm font-semibold", gradeColor(average))}>
                  {average}%
                </div>
                {gpa != null && (
                  <div className="text-xs text-muted-foreground">GPA {gpa.toFixed(1)}</div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground italic">In Progress</div>
            )}
          </div>
        </div>
      </CardHeader>

      {course.assignments.length > 0 && (
        <CardContent className="pt-0">
          <Separator className="mb-3" />
          <div className="space-y-1.5">
            {course.assignments.map((assignment) => {
              const pct =
                assignment.grade != null && assignment.pointsPossible
                  ? Math.round((assignment.grade / assignment.pointsPossible) * 100)
                  : null;
              const graded = assignment.grade != null;

              return (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between gap-3 py-1 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {graded ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span className="truncate text-foreground/80">{assignment.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {graded ? (
                      <>
                        <span className="text-muted-foreground text-xs">
                          {assignment.grade}/{assignment.pointsPossible ?? "?"}
                        </span>
                        <span className={cn("text-xs font-semibold w-10 text-right", gradeColor(pct))}>
                          {pct != null ? `${pct}%` : "—"}
                        </span>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {assignment.status === "submitted" ? "Pending" : "Not submitted"}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-1">
            <span>
              {gradedCount} of {course.assignments.length} assignment
              {course.assignments.length !== 1 ? "s" : ""} graded
            </span>
            {!!course.attendanceWeightPercent && course.attendancePercent != null && (
              <span>
                Attendance: {course.attendancePercent}% (counts {course.attendanceWeightPercent}% of grade)
              </span>
            )}
            {average != null && (
              <span className={cn("font-semibold", gradeColor(average))}>
                Course Average: {average}%
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface StudentTranscriptProps {
  /** When provided (admin/teacher viewing a specific student), overrides the current user. */
  studentId?: string;
  /** Set by the admin wrapper page — renders without StudentLayout's own chrome/back-link. */
  bare?: boolean;
}

export function TranscriptDocument({ studentId: studentIdProp, bare }: StudentTranscriptProps) {
  const { user } = useAuth();
  const studentId = studentIdProp ?? user?.id;
  const { data: school } = useGetMySchool({ query: { enabled: !!user?.schoolId } });

  const {
    data: transcript,
    isLoading,
    isError,
    error,
  } = useQuery<TranscriptData, Error>({
    queryKey: ["transcript", studentId],
    queryFn: () => fetchTranscript(studentId!),
    enabled: !!studentId,
    retry: 1,
  });

  // The API (lib/gradingEngine.ts's computeCourseGrade, blending
  // assignments/quizzes/attendance) already returns the authoritative
  // overall percent and GPA — only fall back to a client recompute if an
  // older API response somehow doesn't include them.
  const gpaData = (() => {
    if (!transcript) return null;
    if (transcript.overallPercent != null && transcript.gpa != null) {
      return { overallPct: transcript.overallPercent, gpa: transcript.gpa };
    }
    const averages = transcript.courses
      .map((c) => c.courseAverage ?? calcCourseAverage(c.assignments))
      .filter((v): v is number => v != null);
    if (averages.length === 0) return null;
    const overallPct = averages.reduce((s, v) => s + v, 0) / averages.length;
    const gpa = averages.map(percentToGpa).reduce((s, v) => s + v, 0) / averages.length;
    return { overallPct: Math.round(overallPct), gpa: Math.round(gpa * 100) / 100 };
  })();

  const handlePrint = () => {
    window.print();
  };

  const body = (
    <div className="space-y-6 print:space-y-4 max-w-4xl mx-auto print:max-w-none">
      {/* Header — hidden when printing */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            {studentIdProp ? "Student Transcript" : "My Transcript"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {school?.name ? `${school.name} — ` : ""}
            Academic record across all enrolled courses.
          </p>
        </div>
        <Button variant="outline" onClick={handlePrint} className="gap-2 self-start sm:self-auto">
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      {/* Official letterhead — shown on screen too, styled like a real document header */}
      <div className="rounded-xl border-2 border-primary/15 bg-gradient-to-b from-primary/5 to-transparent px-6 py-5 print:border-b-2 print:border-black print:rounded-none print:bg-white print:px-0 print:pb-4">
        <div className="flex items-center gap-4">
          {school?.logoUrl ? (
            <img
              src={school.logoUrl}
              alt={school.name ?? "School logo"}
              className="h-14 w-14 rounded-lg object-cover border shrink-0 print:h-12 print:w-12"
            />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 print:h-12 print:w-12">
              <GraduationCap className="h-7 w-7 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight leading-tight truncate">
              {school?.name ?? "SolomonQuest School"}
            </p>
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">
              Official Academic Transcript
            </p>
          </div>
        </div>
        {transcript && (
          <div className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Student</p>
              <p className="font-semibold">{transcript.studentName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Issued</p>
              <p className="font-semibold">
                {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
            <div className="flex items-start gap-1.5 col-span-2 sm:col-span-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Verification</p>
                <p className="text-xs text-muted-foreground">Verify any released transcript at /transcript</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-destructive/30">
            <CardContent className="text-center py-12">
              <AlertCircle className="h-10 w-10 mx-auto text-destructive/60 mb-3" />
              <p className="font-semibold text-destructive">Failed to load transcript</p>
              <p className="text-sm text-muted-foreground mt-1">
                {error?.message || "An unexpected error occurred."}
              </p>
            </CardContent>
          </Card>
        ) : transcript ? (
          <>
            {/* GPA Summary Card */}
            <Card className={cn("border-2", gpaData ? "border-primary/20" : "border-dashed")}>
              <CardContent className="py-5">
                <div className="flex flex-wrap items-center gap-6 justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Cumulative GPA
                      </span>
                    </div>
                    {gpaData ? (
                      <>
                        <div className={cn("text-4xl font-bold", gpaColor(gpaData.gpa))}>
                          {gpaData.gpa.toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          Overall average: {gpaData.overallPct}%
                        </div>
                      </>
                    ) : (
                      <div className="text-lg text-muted-foreground">No grades yet</div>
                    )}
                  </div>

                  <div className="text-right space-y-1 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">{transcript.courses.length}</span>{" "}
                      course{transcript.courses.length !== 1 ? "s" : ""}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        {transcript.courses.reduce((s, c) => s + c.assignments.length, 0)}
                      </span>{" "}
                      total assignments
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        {transcript.courses.reduce(
                          (s, c) => s + c.assignments.filter((a) => a.grade != null).length,
                          0
                        )}
                      </span>{" "}
                      graded
                    </div>
                  </div>

                  {/* GPA scale legend */}
                  <div className="hidden sm:block text-xs text-muted-foreground space-y-0.5 border-l pl-6">
                    <div className="font-semibold mb-1">GPA Scale</div>
                    {[
                      { label: "A  (90%+)", gpa: "4.0", color: "text-green-600" },
                      { label: "B  (80%+)", gpa: "3.0", color: "text-blue-600" },
                      { label: "C  (70%+)", gpa: "2.0", color: "text-amber-600" },
                      { label: "D  (60%+)", gpa: "1.0", color: "text-orange-500" },
                      { label: "F  (below)", gpa: "0.0", color: "text-red-600" },
                    ].map((row) => (
                      <div key={row.gpa} className="flex gap-3 justify-between font-mono">
                        <span>{row.label}</span>
                        <span className={cn("font-medium", row.color)}>{row.gpa}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Per-course cards */}
            {transcript.courses.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="text-center py-12">
                  <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="font-medium">No transcript available yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {transcript.courses.map((course) => (
                  <CourseTranscriptCard key={course.id} course={course} />
                ))}
              </div>
            )}
          </>
        ) : null}
    </div>
  );

  if (bare) return body;

  return (
    <StudentLayout>
      <div className="px-6 pt-4 pb-0 print:hidden">
        <Link href="/dashboard/student">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
      {body}
    </StudentLayout>
  );
}

export default function StudentTranscript() {
  return <TranscriptDocument />;
}
