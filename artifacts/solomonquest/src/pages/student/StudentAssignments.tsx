import { useState } from "react";
import { StudentLayout } from "@/components/layout/StudentLayout";
import {
  useListPendingAssignments,
  useSubmitAssignment,
  useGetMyCourses,
  useListAssignments,
  getListPendingAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  CheckSquare,
  FileText,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { Assignment } from "@workspace/api-client-react";

type AssignmentStatus = "not_started" | "in_progress" | "submitted" | "graded";

interface EnrichedAssignment extends Assignment {
  status: AssignmentStatus;
  grade?: number;
}

function getStatus(assignment: Assignment): AssignmentStatus {
  return "not_started";
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const config: Record<AssignmentStatus, { label: string; className: string }> = {
    not_started: { label: "Not Started", className: "bg-muted text-muted-foreground" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    submitted: { label: "Submitted", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    graded: { label: "Graded", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  };
  const { label, className } = config[status];
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", className)}>
      {label}
    </span>
  );
}

function DueDateBadge({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return <span className="text-xs text-muted-foreground">No due date</span>;
  const date = new Date(dueDate);
  const overdue = isPast(date);
  const dueSoon = !overdue && isWithinInterval(date, { start: new Date(), end: addDays(new Date(), 3) });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        overdue ? "text-destructive" : dueSoon ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
      )}
    >
      <Calendar className="h-3 w-3" />
      {overdue ? "Overdue: " : "Due: "}
      {format(date, "MMM d, yyyy")}
    </span>
  );
}

export default function StudentAssignments() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [submissionContent, setSubmissionContent] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  const { data: pendingAssignments, isLoading: isPendingLoading } = useListPendingAssignments();
  const { data: courses } = useGetMyCourses();
  const submitAssignment = useSubmitAssignment();

  const selectedAssignment = pendingAssignments?.find((a) => a.id === selectedAssignmentId);

  const handleOpenSubmit = (id: string) => {
    setSelectedAssignmentId(id);
    setSubmissionContent("");
  };

  const handleSubmit = () => {
    if (!selectedAssignmentId || !submissionContent.trim()) {
      toast.error("Please enter your submission content");
      return;
    }
    submitAssignment.mutate(
      { assignmentId: selectedAssignmentId, data: { content: submissionContent } },
      {
        onSuccess: () => {
          toast.success("Assignment submitted successfully!");
          setSelectedAssignmentId(null);
          setSubmissionContent("");
          queryClient.invalidateQueries({ queryKey: getListPendingAssignmentsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit assignment");
        },
      }
    );
  };

  const now = new Date();
  const upcomingAssignments = pendingAssignments?.filter(
    (a) => a.dueDate && isWithinInterval(new Date(a.dueDate), { start: now, end: addDays(now, 7) })
  ) ?? [];
  const overdueAssignments = pendingAssignments?.filter(
    (a) => a.dueDate && isPast(new Date(a.dueDate))
  ) ?? [];
  const otherAssignments = pendingAssignments?.filter(
    (a) =>
      !a.dueDate ||
      (!isPast(new Date(a.dueDate)) &&
        !isWithinInterval(new Date(a.dueDate), { start: now, end: addDays(now, 7) }))
  ) ?? [];

  return (
    <StudentLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Assignments</h1>
          <p className="text-muted-foreground mt-0.5">
            Manage and submit your coursework across all enrolled courses.
          </p>
        </div>

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
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onSubmit={() => handleOpenSubmit(assignment.id)}
                      overdue
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
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onSubmit={() => handleOpenSubmit(assignment.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {otherAssignments.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Other Assignments
                </h2>
                <div className="space-y-3">
                  {otherAssignments.map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onSubmit={() => handleOpenSubmit(assignment.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center p-16 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500/60 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-1">All Caught Up!</h3>
              <p className="text-muted-foreground max-w-sm">
                You have no pending assignments right now. Check back later or visit your courses.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={!!selectedAssignmentId}
        onOpenChange={(open) => !open && setSelectedAssignmentId(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedAssignment?.title}</DialogTitle>
            {selectedAssignment?.courseTitle && (
              <p className="text-sm text-primary font-medium">{selectedAssignment.courseTitle}</p>
            )}
          </DialogHeader>

          {selectedAssignment?.dueDate && (
            <div
              className={cn(
                "flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg",
                isPast(new Date(selectedAssignment.dueDate))
                  ? "bg-destructive/10 text-destructive"
                  : "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400"
              )}
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {isPast(new Date(selectedAssignment.dueDate)) ? "Overdue since " : "Due: "}
              {format(new Date(selectedAssignment.dueDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </div>
          )}

          {selectedAssignment?.description && (
            <div className="bg-muted/40 rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Instructions
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {selectedAssignment.description}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">Your Submission</label>
              {selectedAssignment?.pointsPossible != null && (
                <span className="text-xs text-muted-foreground">
                  {selectedAssignment.pointsPossible} points possible
                </span>
              )}
            </div>
            <Textarea
              placeholder="Type your answer or paste a link to your work here..."
              className="min-h-[180px] resize-none text-sm"
              value={submissionContent}
              onChange={(e) => setSubmissionContent(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You can type your work directly, paste a URL, or share a link to a file.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAssignmentId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitAssignment.isPending || !submissionContent.trim()}
            >
              {submitAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudentLayout>
  );
}

function AssignmentCard({
  assignment,
  onSubmit,
  overdue = false,
}: {
  assignment: Assignment;
  onSubmit: () => void;
  overdue?: boolean;
}) {
  return (
    <Card
      className={cn(
        "hover:border-primary/40 transition-colors",
        overdue && "border-destructive/30 bg-destructive/5"
      )}
    >
      <CardContent className="flex items-start gap-4 p-4">
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            overdue
              ? "bg-destructive/10"
              : "bg-orange-100 dark:bg-orange-900/30"
          )}
        >
          <CheckSquare
            className={cn(
              "h-5 w-5",
              overdue
                ? "text-destructive"
                : "text-orange-600 dark:text-orange-400"
            )}
          />
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
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
              {assignment.description}
            </p>
          )}
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <DueDateBadge dueDate={assignment.dueDate} />
            <Button size="sm" onClick={onSubmit} variant={overdue ? "destructive" : "default"}>
              Submit Work
              <ArrowRight className="ml-1.5 h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
