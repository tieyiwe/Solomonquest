import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { Printer, GraduationCap, BookOpen } from "lucide-react";
import { toast } from "sonner";

async function apiFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(options.headers ?? {}),
    },
  });
}

// ---- types ----

interface AssignmentRow {
  id: string;
  title: string;
  due_date?: string | null;
  submitted_date?: string | null;
  grade?: number | null;
  max_grade?: number | null;
  feedback?: string | null;
}

interface CourseTranscript {
  course_id: string;
  course_name: string;
  course_average?: number | null;
  assignments: AssignmentRow[];
}

interface TranscriptData {
  student_name: string;
  unique_student_id: string;
  overall_gpa?: number | null;
  courses: CourseTranscript[];
}

// ---- helpers ----

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function gradeLabel(grade?: number | null, maxGrade?: number | null): string {
  if (grade == null) return "Not graded";
  if (maxGrade) {
    const pct = Math.round((grade / maxGrade) * 100);
    return `${grade}/${maxGrade} (${pct}%)`;
  }
  return `${grade}`;
}

function gradeColor(grade?: number | null, maxGrade?: number | null): string {
  if (grade == null) return "text-muted-foreground";
  if (!maxGrade) return "text-foreground";
  const pct = (grade / maxGrade) * 100;
  if (pct >= 90) return "text-green-600";
  if (pct >= 70) return "text-blue-600";
  if (pct >= 60) return "text-amber-600";
  return "text-red-600";
}

function letterGrade(gpa: number): string {
  if (gpa >= 3.7) return "A";
  if (gpa >= 3.3) return "A-";
  if (gpa >= 3.0) return "B+";
  if (gpa >= 2.7) return "B";
  if (gpa >= 2.3) return "B-";
  if (gpa >= 2.0) return "C+";
  if (gpa >= 1.7) return "C";
  if (gpa >= 1.3) return "C-";
  if (gpa >= 1.0) return "D";
  return "F";
}

// ---- CourseTable ----

function CourseTable({ course }: { course: CourseTranscript }) {
  const hasGradedWork = course.assignments.some((a) => a.grade != null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{course.course_name}</CardTitle>
          </div>
          {course.course_average != null && (
            <div className="text-right shrink-0">
              <div className={`text-lg font-bold ${gradeColor(course.course_average, 100)}`}>
                {Math.round(course.course_average)}%
              </div>
              <div className="text-xs text-muted-foreground">Course Average</div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {course.assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No assignments for this course.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Feedback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {course.assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium text-sm">{assignment.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(assignment.due_date)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {assignment.submitted_date ? (
                        formatDate(assignment.submitted_date)
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Not submitted
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {assignment.grade != null ? (
                        <span
                          className={`text-sm font-semibold ${gradeColor(
                            assignment.grade,
                            assignment.max_grade ?? undefined
                          )}`}
                        >
                          {gradeLabel(assignment.grade, assignment.max_grade)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not graded</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {assignment.feedback || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!hasGradedWork && (
          <p className="text-xs text-muted-foreground mt-2">
            No graded work in this course yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Main Component ----

export default function StudentTranscript() {
  const { user } = useAuth();
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    apiFetch(`/api/grading/transcript/${user.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTranscript(data))
      .catch(() => {
        toast.error("Failed to load transcript");
        setTranscript(null);
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  const hasAnyGradedWork =
    transcript?.courses.some((c) => c.assignments.some((a) => a.grade != null)) ?? false;

  return (
    <StudentLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              Academic Transcript
            </h1>
            {loading ? (
              <div className="mt-2 space-y-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-36" />
              </div>
            ) : transcript ? (
              <div className="mt-1 text-muted-foreground text-sm space-y-0.5">
                <p className="text-base font-semibold text-foreground">{transcript.student_name}</p>
                <p>Student ID: {transcript.unique_student_id}</p>
              </div>
            ) : null}
          </div>

          <Button
            variant="outline"
            onClick={() => window.print()}
            className="shrink-0 print:hidden"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>

        {/* GPA Banner */}
        {loading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : transcript && transcript.overall_gpa != null ? (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-5">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">
                    {transcript.overall_gpa.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Cumulative GPA</div>
                </div>
                <div className="h-12 border-l border-primary/20" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    {letterGrade(transcript.overall_gpa)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Letter Grade</div>
                </div>
                <div className="h-12 border-l border-primary/20" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {transcript.courses.length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Course{transcript.courses.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Courses */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !transcript || transcript.courses.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="text-center py-16">
              <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-base font-medium">No transcript available</p>
              <p className="text-sm text-muted-foreground mt-1">
                You have no graded work yet. Check back once assignments have been graded.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {!hasAnyGradedWork && (
              <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3 border">
                No graded work yet. Your grades will appear here once assignments are graded.
              </div>
            )}
            {transcript.courses.map((course) => (
              <CourseTable key={course.course_id} course={course} />
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
