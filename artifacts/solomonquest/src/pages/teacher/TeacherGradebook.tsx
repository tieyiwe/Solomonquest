import { useState } from "react";
import { Link } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import {
  useGetMyCourses,
  useListAssignments,
  useGetCourseStudents,
  useListSubmissions,
  useGradeSubmission,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BookOpen,
  ClipboardList,
  Users,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function GradeCell({
  value,
  max,
  onSave,
}: {
  value: number | null | undefined;
  max: number | null | undefined;
  onSave: (grade: number) => void;
}) {
  const pct = value != null && max ? Math.round((value / max) * 100) : null;

  const getColor = (pct: number | null) => {
    if (pct == null) return "text-muted-foreground";
    if (pct >= 90) return "text-green-600";
    if (pct >= 70) return "text-blue-600";
    if (pct >= 60) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="flex items-center gap-1 min-w-[80px]">
      <Input
        type="number"
        defaultValue={value ?? ""}
        className="h-7 w-14 text-xs text-center p-1"
        onBlur={(e) => {
          if (e.target.value !== "") {
            onSave(Number(e.target.value));
          }
        }}
      />
      {pct != null && (
        <span className={cn("text-xs font-medium", getColor(pct))}>{pct}%</span>
      )}
    </div>
  );
}

function CourseGradebook({ courseId }: { courseId: string }) {
  const { data: students, isLoading: isLoadingStudents } = useGetCourseStudents(courseId, {
    query: { enabled: !!courseId },
  });
  const { data: assignments, isLoading: isLoadingAssignments } = useListAssignments(courseId, {
    query: { enabled: !!courseId },
  });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const { data: submissions } = useListSubmissions(selectedAssignmentId || "", {
    query: { enabled: !!selectedAssignmentId },
  });

  const gradeSubmission = useGradeSubmission();

  const getInitials = (firstName?: string | null, lastName?: string | null) =>
    `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "S";

  const getSubmission = (studentId: string) =>
    submissions?.find((s) => s.studentId === studentId);

  const handleGrade = (submissionId: string, grade: number) => {
    gradeSubmission.mutate(
      { id: submissionId, data: { grade } },
      {
        onSuccess: () => toast.success("Grade saved"),
        onError: () => toast.error("Failed to save grade"),
      }
    );
  };

  if (isLoadingStudents || isLoadingAssignments) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const selectedAssignment = assignments?.find((a) => a.id === selectedAssignmentId);

  return (
    <div className="space-y-4">
      {/* Assignment Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          View grades for:
        </label>
        <Select
          value={selectedAssignmentId || ""}
          onValueChange={(v) => setSelectedAssignmentId(v || null)}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select an assignment..." />
          </SelectTrigger>
          <SelectContent>
            {assignments?.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedAssignmentId && (
          <Badge variant="outline" className="text-xs">
            {selectedAssignment?.pointsPossible ?? 0} pts
          </Badge>
        )}
      </div>

      {/* Grade Table */}
      {students && students.length > 0 ? (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="min-w-[200px]">Student</TableHead>
                <TableHead>Email</TableHead>
                {selectedAssignmentId && (
                  <>
                    <TableHead>Status</TableHead>
                    <TableHead>Grade</TableHead>
                  </>
                )}
                {!selectedAssignmentId && (
                  <TableHead className="text-muted-foreground italic">
                    Select an assignment above
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const sub = getSubmission(student.id);
                return (
                  <TableRow key={student.id} className="hover:bg-muted/20">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={student.avatarUrl || ""} />
                          <AvatarFallback className="text-xs">
                            {getInitials(student.firstName, student.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {student.firstName} {student.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {student.email}
                    </TableCell>
                    {selectedAssignmentId && (
                      <>
                        <TableCell>
                          {sub ? (
                            <Badge
                              variant={
                                sub.status === "graded"
                                  ? "default"
                                  : sub.status === "submitted"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-xs capitalize"
                            >
                              {sub.status}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Not submitted
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub ? (
                            <GradeCell
                              value={sub.grade}
                              max={selectedAssignment?.pointsPossible}
                              onSave={(grade) => handleGrade(sub.id, grade)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </>
                    )}
                    {!selectedAssignmentId && <TableCell />}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <Users className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
        </div>
      )}

      {/* Assignment Summary */}
      {assignments && assignments.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            All Assignments
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {assignments.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAssignmentId(a.id)}
                className={cn(
                  "text-left p-3 rounded-lg border text-sm transition-all hover:border-primary/50",
                  selectedAssignmentId === a.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                )}
              >
                <div className="font-medium line-clamp-1">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {a.pointsPossible ?? 0} pts
                  {!a.isPublished && (
                    <Badge variant="secondary" className="ml-1 text-xs py-0">
                      Draft
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherGradebook() {
  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const selectedCourse = courses?.find((c) => c.id === selectedCourseId);

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Gradebook</h1>
            <p className="text-muted-foreground mt-1">
              View and manage student grades across all your courses.
            </p>
          </div>
        </div>

        {isCoursesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="space-y-6">
            {/* Course Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() =>
                    setSelectedCourseId(selectedCourseId === course.id ? null : course.id)
                  }
                  className={cn(
                    "text-left rounded-xl border p-4 transition-all hover:shadow-sm",
                    selectedCourseId === course.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 bg-card"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        selectedCourseId === course.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10"
                      )}
                    >
                      <ClipboardList
                        className={cn(
                          "h-4 w-4",
                          selectedCourseId === course.id ? "text-primary-foreground" : "text-primary"
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm line-clamp-1">{course.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {course.code} {course.term ? `• ${course.term}` : ""}
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {course.studentCount || 0} students
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Grade Panel */}
            {selectedCourseId ? (
              <Card>
                <CardHeader className="border-b">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        {selectedCourse?.title}
                      </CardTitle>
                      <CardDescription>
                        {selectedCourse?.code}
                        {selectedCourse?.term ? ` • ${selectedCourse.term}` : ""}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/teacher/courses/${selectedCourseId}`}>
                        Course Detail
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-5">
                  <CourseGradebook courseId={selectedCourseId} />
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="text-center py-12">
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-base font-medium text-foreground mb-1">
                    Select a course to view grades
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Click on a course card above to open its gradebook.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="text-center py-16">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No courses assigned</h3>
              <p className="text-sm text-muted-foreground">
                You are not assigned to any courses yet. Contact your administrator.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TeacherLayout>
  );
}
