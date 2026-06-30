import { useState } from "react";
import { StudentLayout } from "@/components/layout/StudentLayout";
import {
  useListPendingAssignments,
  useSubmitAssignment,
  useGetMyCourses,
  useListAssignments,
  getListPendingAssignmentsQueryKey,
} from "@workspace/api-client-react";
import type { Assignment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  CheckSquare,
  FileText,
  Loader2,
  ArrowRight,
  BookOpen,
  Star,
  ExternalLink,
} from "lucide-react";
import { format, isPast, isToday, isWithinInterval, addDays } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type DuePriority = "overdue" | "today" | "soon" | "future" | "none";

function getDuePriority(dueDate?: string | null): DuePriority {
  if (!dueDate) return "none";
  const date = new Date(dueDate);
  if (isPast(date) && !isToday(date)) return "overdue";
  if (isToday(date)) return "today";
  if (isWithinInterval(date, { start: new Date(), end: addDays(new Date(), 7) })) return "soon";
  return "future";
}

function DueDateBadge({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return <span className="text-xs text-muted-foreground">No due date</span>;
  const date = new Date(dueDate);
  const priority = getDuePriority(dueDate);

  const colorMap: Record<DuePriority, string> = {
    overdue: "text-destructive",
    today: "text-orange-600 dark:text-orange-400",
    soon: "text-amber-600 dark:text-amber-400",
    future: "text-muted-foreground",
    none: "text-muted-foreground",
  };

  const labels: Record<DuePriority, string> = {
    overdue: "Overdue: ",
    today: "Due today: ",
    soon: "Due: ",
    future: "Due: ",
    none: "",
  };

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", colorMap[priority])}>
      <Calendar className="h-3 w-3" />
      {labels[priority]}
      {format(date, "MMM d, yyyy h:mm a")}
    </span>
  );
}

function SubmitDialog({
  assignment,
  onClose,
}: {
  assignment: Assignment;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const submitAssignment = useSubmitAssignment();
  const [fileUrl, setFileUrl] = useState("");
  const [comment, setComment] = useState("");

  const handleSubmit = () => {
    if (!fileUrl.trim() && !comment.trim()) {
      toast.error("Please provide a file URL or comment");
      return;
    }
    submitAssignment.mutate(
      {
        assignmentId: assignment.id,
        data: {
          content: [fileUrl.trim() ? `File: ${fileUrl.trim()}` : "", comment.trim()]
            .filter(Boolean)
            .join("\n\n"),
        },
      },
      {
        onSuccess: () => {
          toast.success("Assignment submitted successfully!");
          queryClient.invalidateQueries({ queryKey: getListPendingAssignmentsQueryKey() });
          onClose();
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit assignment");
        },
      }
    );
  };

  const priority = getDuePriority(assignment.dueDate);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{assignment.title}</DialogTitle>
        {assignment.courseTitle && (
          <p className="text-sm text-primary font-medium">{assignment.courseTitle}</p>
        )}
      </DialogHeader>

      {assignment.dueDate && (
        <div
          className={cn(
            "flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg",
            priority === "overdue"
              ? "bg-destructive/10 text-destructive"
              : priority === "today"
              ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {priority === "overdue" ? "Overdue since " : "Due: "}
          {format(new Date(assignment.dueDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
        </div>
      )}

      {assignment.description && (
        <div className="bg-muted/40 rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Description
          </p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {assignment.description}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="file_url">File URL (optional)</Label>
          <Input
            id="file_url"
            type="url"
            placeholder="https://drive.google.com/..."
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Link to your Google Drive file, Supabase storage URL, or any shareable document link.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="comment">Comment (optional)</Label>
            {assignment.pointsPossible != null && (
              <span className="text-xs text-muted-foreground">
                {assignment.pointsPossible} points possible
              </span>
            )}
          </div>
          <Textarea
            id="comment"
            placeholder="Add a note to your teacher..."
            className="min-h-[100px] resize-none text-sm"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitAssignment.isPending || (!fileUrl.trim() && !comment.trim())}
        >
          {submitAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Assignment
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface EnrichedAssignment extends Assignment {
  submissionStatus?: "submitted" | "graded" | null;
  grade?: number | null;
  hasSubmitted?: boolean;
}

function AssignmentRow({
  assignment,
  onSubmit,
}: {
  assignment: EnrichedAssignment;
  onSubmit: () => void;
}) {
  const priority = getDuePriority(assignment.dueDate);

  const borderClass =
    priority === "overdue"
      ? "border-destructive/40 bg-destructive/5"
      : priority === "today"
      ? "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10"
      : "";

  const submitted = assignment.hasSubmitted || assignment.submissionStatus;
  const graded = assignment.submissionStatus === "graded" || assignment.grade != null;

  return (
    <Card className={cn("hover:border-primary/40 transition-colors", borderClass)}>
      <CardContent className="flex items-start gap-4 p-4">
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            submitted
              ? "bg-green-100 dark:bg-green-900/30"
              : priority === "overdue"
              ? "bg-destructive/10"
              : priority === "today"
              ? "bg-orange-100 dark:bg-orange-900/30"
              : "bg-primary/10"
          )}
        >
          {submitted ? (
            <CheckCircle2
              className={cn("h-5 w-5", graded ? "text-purple-600" : "text-green-600 dark:text-green-400")}
            />
          ) : (
            <CheckSquare
              className={cn(
                "h-5 w-5",
                priority === "overdue"
                  ? "text-destructive"
                  : priority === "today"
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-primary"
              )}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 justify-between flex-wrap">
            <div className="min-w-0">
              {assignment.courseTitle && (
                <p className="text-xs font-medium text-primary mb-0.5">{assignment.courseTitle}</p>
              )}
              <p className="font-semibold text-foreground">{assignment.title}</p>
            </div>
            {assignment.pointsPossible != null && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {assignment.pointsPossible} pts
              </Badge>
            )}
          </div>

          {assignment.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {assignment.description}
            </p>
          )}

          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <DueDateBadge dueDate={assignment.dueDate} />

            {submitted ? (
              <div className="flex items-center gap-2">
                {graded && assignment.grade != null ? (
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Grade: {assignment.grade}/{assignment.pointsPossible ?? "?"}
                  </span>
                ) : null}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    graded
                      ? "border-purple-300 text-purple-600 dark:text-purple-400"
                      : "border-green-300 text-green-600 dark:text-green-400"
                  )}
                >
                  {graded ? "Graded" : "Submitted"} ✓
                </Badge>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={onSubmit}
                variant={priority === "overdue" ? "destructive" : "default"}
              >
                Submit Work
                <ArrowRight className="ml-1.5 h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CourseAssignmentsList({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [submitTarget, setSubmitTarget] = useState<Assignment | null>(null);

  const { data: assignments, isLoading } = useListAssignments(courseId, {
    query: { enabled: !!courseId },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!assignments || assignments.length === 0) {
    return (
      <div className="text-center py-4 border border-dashed rounded-lg">
        <p className="text-sm text-muted-foreground">No assignments yet.</p>
      </div>
    );
  }

  const sorted = [...assignments].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return (
    <>
      <div className="space-y-2">
        {sorted.map((assignment) => (
          <AssignmentRow
            key={assignment.id}
            assignment={assignment as EnrichedAssignment}
            onSubmit={() => setSubmitTarget(assignment)}
          />
        ))}
      </div>

      <Dialog open={!!submitTarget} onOpenChange={(v) => !v && setSubmitTarget(null)}>
        {submitTarget && (
          <SubmitDialog
            assignment={submitTarget}
            onClose={() => setSubmitTarget(null)}
          />
        )}
      </Dialog>
    </>
  );
}

export default function StudentAssignments() {
  const { data: pendingAssignments, isLoading: isPendingLoading } = useListPendingAssignments();
  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();
  const [submitTarget, setSubmitTarget] = useState<Assignment | null>(null);
  const queryClient = useQueryClient();

  const now = new Date();
  const upcomingAssignments = pendingAssignments?.filter(
    (a) => a.dueDate && isWithinInterval(new Date(a.dueDate), { start: now, end: addDays(now, 7) })
  ) ?? [];
  const overdueAssignments = pendingAssignments?.filter(
    (a) => a.dueDate && isPast(new Date(a.dueDate)) && !isToday(new Date(a.dueDate))
  ) ?? [];

  return (
    <StudentLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Assignments</h1>
          <p className="text-muted-foreground mt-0.5">
            View and submit your coursework across all enrolled courses.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{overdueAssignments.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Overdue</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-900/5">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {upcomingAssignments.length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Due This Week</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{pendingAssignments?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Pending</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Assignments - quick view */}
        {isPendingLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : pendingAssignments && pendingAssignments.length > 0 ? (
          <div className="space-y-6">
            {overdueAssignments.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-destructive uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  Overdue
                </h2>
                <div className="space-y-3">
                  {overdueAssignments.map((assignment) => (
                    <AssignmentRow
                      key={assignment.id}
                      assignment={assignment as EnrichedAssignment}
                      onSubmit={() => setSubmitTarget(assignment)}
                    />
                  ))}
                </div>
              </section>
            )}

            {upcomingAssignments.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Due This Week
                </h2>
                <div className="space-y-3">
                  {upcomingAssignments.map((assignment) => (
                    <AssignmentRow
                      key={assignment.id}
                      assignment={assignment as EnrichedAssignment}
                      onSubmit={() => setSubmitTarget(assignment)}
                    />
                  ))}
                </div>
              </section>
            )}

            {(() => {
              const others = pendingAssignments.filter(
                (a) =>
                  !overdueAssignments.find((o) => o.id === a.id) &&
                  !upcomingAssignments.find((u) => u.id === a.id)
              );
              return others.length > 0 ? (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Other Assignments
                  </h2>
                  <div className="space-y-3">
                    {others.map((assignment) => (
                      <AssignmentRow
                        key={assignment.id}
                        assignment={assignment as EnrichedAssignment}
                        onSubmit={() => setSubmitTarget(assignment)}
                      />
                    ))}
                  </div>
                </section>
              ) : null;
            })()}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center p-16 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500/60 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-1">All Caught Up!</h3>
              <p className="text-muted-foreground max-w-sm">
                You have no pending assignments right now.
              </p>
            </CardContent>
          </Card>
        )}

        {/* By Course — full view including submitted */}
        <div className="pt-4 border-t">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            All Assignments by Course
          </h2>

          {isCoursesLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : courses && courses.length > 0 ? (
            <div className="space-y-8">
              {courses.map((course) => (
                <div key={course.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="font-semibold text-sm">{course.title}</span>
                  </div>
                  <div className="pl-2">
                    <CourseAssignmentsList courseId={course.id} courseName={course.title} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="text-center py-10">
                <p className="text-muted-foreground text-sm">
                  You are not enrolled in any courses yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Submit dialog for pending section */}
      <Dialog open={!!submitTarget} onOpenChange={(v) => !v && setSubmitTarget(null)}>
        {submitTarget && (
          <SubmitDialog
            assignment={submitTarget}
            onClose={() => setSubmitTarget(null)}
          />
        )}
      </Dialog>
    </StudentLayout>
  );
}
