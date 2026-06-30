import { useState } from "react";
import { Link } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import {
  useGetMyCourses,
  useListAssignments,
  useCreateAssignment,
  useListSubmissions,
  useGradeSubmission,
  getListAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Plus,
  Loader2,
  FileText,
  Clock,
  ChevronDown,
  ChevronRight,
  Users,
  CheckCircle2,
  Eye,
  BookOpen,
  X,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const assignmentSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  pointsPossible: z.coerce.number().min(0).optional(),
  courseId: z.string().min(1, "Please select a course"),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

function CourseAssignmentsPanel({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewSubmissionsFor, setViewSubmissionsFor] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: assignments, isLoading } = useListAssignments(courseId, {
    query: { enabled: !!courseId },
  });

  const { data: submissions, isLoading: isLoadingSubmissions } = useListSubmissions(
    viewSubmissionsFor || "",
    { query: { enabled: !!viewSubmissionsFor } }
  );

  const gradeSubmission = useGradeSubmission();

  const handleGrade = (submissionId: string, grade: number) => {
    gradeSubmission.mutate(
      { id: submissionId, data: { grade } },
      {
        onSuccess: () => toast.success("Grade saved"),
        onError: () => toast.error("Failed to save grade"),
      }
    );
  };

  const viewingAssignment = assignments?.find((a) => a.id === viewSubmissionsFor);

  return (
    <div className="space-y-3">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="font-semibold text-sm">{courseName}</span>
        <Badge variant="outline" className="ml-1 text-xs">
          {assignments?.length || 0}
        </Badge>
        <span className="ml-auto text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="pl-2 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : assignments && assignments.length > 0 ? (
            assignments.map((assignment) => (
              <Card
                key={assignment.id}
                className={`hover:border-primary/40 transition-colors ${
                  viewSubmissionsFor === assignment.id ? "border-primary" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-sm">{assignment.title}</h4>
                        {!assignment.isPublished && (
                          <Badge variant="secondary" className="text-xs">
                            Draft
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {assignment.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Due {format(new Date(assignment.dueDate), "MMM d, yyyy")}
                          </span>
                        )}
                        <span>{assignment.pointsPossible ?? 0} pts</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={viewSubmissionsFor === assignment.id ? "default" : "outline"}
                      onClick={() =>
                        setViewSubmissionsFor(
                          viewSubmissionsFor === assignment.id ? null : assignment.id
                        )
                      }
                      className="shrink-0"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      {viewSubmissionsFor === assignment.id ? "Hide" : "Submissions"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-6 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">No assignments in this course.</p>
            </div>
          )}

          {viewSubmissionsFor && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    Submissions: {viewingAssignment?.title}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {submissions?.length || 0} submissions
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewSubmissionsFor(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingSubmissions ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : submissions && submissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Student</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs w-36">Grade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="text-sm font-medium py-2">
                            {sub.studentName || sub.studentId}
                          </TableCell>
                          <TableCell className="py-2">
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
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                defaultValue={sub.grade ?? ""}
                                className="h-7 w-16 text-xs"
                                onBlur={(e) => {
                                  if (e.target.value !== "") {
                                    handleGrade(sub.id, Number(e.target.value));
                                  }
                                }}
                                disabled={gradeSubmission.isPending}
                              />
                              <span className="text-xs text-muted-foreground">
                                /{viewingAssignment?.pointsPossible ?? "?"}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-6">
                    <Clock className="h-7 w-7 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground">No submissions yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeacherAssignments() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();
  const createAssignment = useCreateAssignment();

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: "",
      description: "",
      dueDate: "",
      pointsPossible: 100,
      courseId: "",
    },
  });

  const onSubmit = (data: AssignmentFormValues) => {
    const { courseId, ...rest } = data;
    createAssignment.mutate(
      { courseId, data: rest },
      {
        onSuccess: () => {
          toast.success("Assignment created successfully");
          setIsCreateOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(courseId) });
        },
        onError: () => toast.error("Failed to create assignment"),
      }
    );
  };

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Assignments</h1>
            <p className="text-muted-foreground mt-1">
              Manage assignments and grade student submissions across all your courses.
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Assignment</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="courseId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Course</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a course..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {courses?.map((course) => (
                              <SelectItem key={course.id} value={course.id}>
                                {course.title}
                                {course.code ? ` (${course.code})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Midterm Essay" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instructions</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the assignment..."
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pointsPossible"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Points</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createAssignment.isPending}
                  >
                    {createAssignment.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Assignment
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Stats */}
        {!isCoursesLoading && courses && courses.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{courses.length}</div>
                  <div className="text-xs text-muted-foreground">Courses</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {courses.reduce((s) => s + 0, 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Assignments</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">0</div>
                  <div className="text-xs text-muted-foreground">Pending Grading</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Per-Course Assignments */}
        {isCoursesLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="space-y-6">
            {courses.map((course) => (
              <CourseAssignmentsPanel
                key={course.id}
                courseId={course.id}
                courseName={course.title}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="text-center py-16">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg mb-2">No courses assigned</h3>
              <p className="text-muted-foreground text-sm">
                You need to be assigned to a course before creating assignments.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TeacherLayout>
  );
}
