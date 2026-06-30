import { useState } from "react";
import { useParams, Link } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useCreateAssignment, useListAssignments, useListSubmissions, useGradeSubmission, getListAssignmentsQueryKey, useGetCourse } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Plus, Loader2, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

const assignmentSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  pointsPossible: z.coerce.number().optional(),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

const gradeSchema = z.object({
  grade: z.coerce.number().min(0, "Grade cannot be negative"),
  feedback: z.string().optional(),
});

export default function TeacherAssignments() {
  const params = useParams();
  const courseId = params.id || "";
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);

  const { data: course } = useGetCourse(courseId, { query: { enabled: !!courseId } });
  
  const { data: assignments, isLoading: isAssignmentsLoading } = useListAssignments(courseId, {
    query: { enabled: !!courseId }
  });

  const { data: submissions, isLoading: isSubmissionsLoading } = useListSubmissions(selectedAssignment || "", {
    query: { enabled: !!selectedAssignment }
  });

  const createAssignment = useCreateAssignment();
  const gradeSubmission = useGradeSubmission();

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: "",
      description: "",
      dueDate: "",
      pointsPossible: 100,
    },
  });

  const onSubmitAssignment = (data: AssignmentFormValues) => {
    createAssignment.mutate(
      { courseId, data },
      {
        onSuccess: () => {
          toast.success("Assignment created");
          setIsCreateOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(courseId) });
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to create assignment");
        }
      }
    );
  };

  const handleGrade = (submissionId: string, grade: number) => {
    gradeSubmission.mutate(
      { id: submissionId, data: { grade } },
      {
        onSuccess: () => {
          toast.success("Grade submitted");
          if (selectedAssignment) {
            // we'd invalidate the submissions query, but it doesn't have a helper exported.
            // A quick refetch is fine or just rely on a broader invalidation
            queryClient.invalidateQueries();
          }
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit grade");
        }
      }
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-muted-foreground">
              <Link href={`/dashboard/teacher/courses/${courseId}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to {course?.title || "Course"}
              </Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Assignments & Grading</h1>
            <p className="text-muted-foreground">Manage coursework and grade student submissions.</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Assignment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Assignment</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitAssignment)} className="space-y-4">
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
                          <Textarea placeholder="Write a 500 word essay on..." {...field} />
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
                          <FormLabel>Points Possible</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createAssignment.isPending}>
                    {createAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 border-border">
            <CardHeader className="bg-muted/30">
              <CardTitle className="text-lg">Assignments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isAssignmentsLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
                </div>
              ) : assignments && assignments.length > 0 ? (
                <div className="flex flex-col">
                  {assignments.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAssignment(a.id)}
                      className={`text-left p-4 border-b last:border-0 hover:bg-muted/50 transition-colors ${selectedAssignment === a.id ? 'bg-primary/5 border-l-4 border-l-primary' : 'border-l-4 border-l-transparent'}`}
                    >
                      <div className="font-medium text-sm line-clamp-1">{a.title}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                        <span>{a.pointsPossible} pts</span>
                        {a.dueDate && <span>{format(new Date(a.dueDate), "MMM d")}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No assignments created yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 flex flex-col h-[600px]">
            {selectedAssignment ? (
              <>
                <CardHeader className="border-b bg-muted/10 pb-4">
                  <CardTitle className="flex justify-between items-center">
                    <span>Submissions</span>
                    <Badge variant="secondary">
                      {submissions?.length || 0} Submitted
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0">
                  {isSubmissionsLoading ? (
                    <div className="p-4 space-y-4">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : submissions && submissions.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-[150px]">Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissions.map(sub => (
                          <TableRow key={sub.id}>
                            <TableCell className="font-medium">{sub.studentName}</TableCell>
                            <TableCell>
                              <Badge variant={sub.status === 'graded' ? "default" : sub.status === 'submitted' ? "secondary" : "outline"} className="capitalize">
                                {sub.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="number" 
                                  defaultValue={sub.grade ?? ""}
                                  className="h-8 w-20"
                                  onBlur={(e) => {
                                    if(e.target.value) handleGrade(sub.id, Number(e.target.value))
                                  }}
                                  disabled={gradeSubmission.isPending}
                                />
                                <span className="text-xs text-muted-foreground">/ pts</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
                      <Clock className="h-10 w-10 mb-4 opacity-50" />
                      <p>No submissions yet for this assignment.</p>
                    </div>
                  )}
                </CardContent>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
                <FileText className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium text-foreground">Select an assignment</p>
                <p>Choose an assignment from the list to view and grade submissions.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
