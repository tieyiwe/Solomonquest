import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useListPendingAssignments, useSubmitAssignment, getListPendingAssignmentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, Calendar, ArrowRight, AlertCircle, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function StudentAssignments() {
  const queryClient = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [submissionContent, setSubmissionContent] = useState("");
  
  const { data: assignments, isLoading } = useListPendingAssignments();
  const submitAssignment = useSubmitAssignment();

  const handleSelect = (id: string) => {
    setSelectedAssignment(id);
    setSubmissionContent("");
  };

  const handleSubmit = () => {
    if (!selectedAssignment) return;
    
    if (!submissionContent.trim()) {
      toast.error("Please enter your submission content");
      return;
    }

    submitAssignment.mutate(
      { assignmentId: selectedAssignment, data: { content: submissionContent } },
      {
        onSuccess: () => {
          toast.success("Assignment submitted successfully!");
          setSelectedAssignment(null);
          setSubmissionContent("");
          queryClient.invalidateQueries({ queryKey: getListPendingAssignmentsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit assignment");
        }
      }
    );
  };

  const activeAssignment = assignments?.find(a => a.id === selectedAssignment);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Assignments</h1>
          <p className="text-muted-foreground">Manage and submit your pending coursework.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List panel */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-chart-4" />
              Pending Action
            </h2>
            
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
              </div>
            ) : assignments && assignments.length > 0 ? (
              <div className="flex flex-col gap-3">
                {assignments.map(a => (
                  <button
                    key={a.id}
                    onClick={() => handleSelect(a.id)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      selectedAssignment === a.id 
                        ? 'bg-card border-primary ring-1 ring-primary/20 shadow-sm' 
                        : 'bg-card/50 border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="text-xs font-medium text-primary mb-1">{a.courseTitle}</div>
                    <div className="font-semibold text-foreground line-clamp-1">{a.title}</div>
                    <div className="flex items-center justify-between mt-3 text-xs">
                      {a.dueDate ? (
                        <span className="flex items-center text-chart-4 font-medium">
                          <Calendar className="mr-1 h-3 w-3" />
                          {format(new Date(a.dueDate), "MMM d")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No due date</span>
                      )}
                      <span className="text-muted-foreground font-medium">{a.pointsPossible} pts</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-primary/50 mb-3" />
                  <p className="text-sm font-medium text-foreground">You're all caught up!</p>
                  <p className="text-xs text-muted-foreground mt-1">No pending assignments.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Action panel */}
          <div className="lg:col-span-2">
            {activeAssignment ? (
              <Card className="h-full flex flex-col border-primary/20 shadow-md">
                <CardHeader className="bg-primary/5 border-b pb-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardDescription className="text-primary font-medium mb-1">
                        {activeAssignment.courseTitle}
                      </CardDescription>
                      <CardTitle className="text-2xl">{activeAssignment.title}</CardTitle>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold bg-background px-3 py-1 rounded-md border inline-block">
                        {activeAssignment.pointsPossible} Points
                      </div>
                    </div>
                  </div>
                  {activeAssignment.dueDate && (
                    <div className="flex items-center text-sm text-chart-4 font-medium mt-4 bg-chart-4/10 px-3 py-1.5 rounded-md inline-flex w-fit">
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Due by {format(new Date(activeAssignment.dueDate), "EEEE, MMMM do 'at' h:mm a")}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex flex-col pt-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Instructions</h3>
                    <p className="text-foreground leading-relaxed">
                      {activeAssignment.description || "No specific instructions provided. Submit your work below."}
                    </p>
                  </div>
                  
                  <div className="flex-1 flex flex-col pt-4 border-t">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Submission</h3>
                    <Textarea 
                      placeholder="Type your answer or paste a link to your work here..." 
                      className="flex-1 min-h-[200px] resize-none text-base p-4 bg-background"
                      value={submissionContent}
                      onChange={(e) => setSubmissionContent(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex justify-end pt-4">
                    <Button 
                      size="lg" 
                      onClick={handleSubmit}
                      disabled={submitAssignment.isPending || !submissionContent.trim()}
                      className="px-8"
                    >
                      {submitAssignment.isPending ? "Submitting..." : "Submit Assignment"}
                      {!submitAssignment.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="h-full min-h-[400px] rounded-xl border border-dashed flex flex-col items-center justify-center text-center p-8 bg-muted/10">
                <CheckSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-medium text-foreground mb-2">Ready to work?</h3>
                <p className="text-muted-foreground max-w-md">Select an assignment from the list to view its instructions and submit your work.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
