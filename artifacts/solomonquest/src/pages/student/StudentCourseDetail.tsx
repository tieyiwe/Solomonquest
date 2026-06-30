import { useParams, Link } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetCourse, useListAssignments, getGetCourseQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function StudentCourseDetail() {
  const params = useParams();
  const courseId = params.id || "";

  const { data: course, isLoading: isCourseLoading } = useGetCourse(courseId, {
    query: { enabled: !!courseId, queryKey: getGetCourseQueryKey(courseId) }
  });

  const { data: assignments, isLoading: isAssignmentsLoading } = useListAssignments(courseId, {
    query: { enabled: !!courseId }
  });

  if (isCourseLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground hover:text-foreground">
            <Link href="/dashboard/student">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          
          <div className="bg-card border rounded-xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-background">{course?.code}</Badge>
                  {course?.term && <span className="text-sm text-muted-foreground">{course.term}</span>}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{course?.title}</h1>
                <p className="text-muted-foreground mt-2">Instructor: <span className="font-medium text-foreground">{course?.teacherName}</span></p>
              </div>
            </div>
            
            {course?.description && (
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Course Description</h3>
                <p className="text-foreground leading-relaxed">{course.description}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Coursework & Assignments</h2>
          </div>
          
          {isAssignmentsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : assignments && assignments.length > 0 ? (
            <div className="grid gap-4">
              {assignments.map(assignment => (
                <Card key={assignment.id} className="border-border hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-4">
                      <CardTitle className="text-lg">{assignment.title}</CardTitle>
                      <Badge variant="secondary" className="shrink-0">
                        {assignment.pointsPossible} pts
                      </Badge>
                    </div>
                    {assignment.dueDate && (
                      <CardDescription className="flex items-center gap-1 text-chart-4 font-medium">
                        <Calendar className="h-3.5 w-3.5" />
                        Due {format(new Date(assignment.dueDate), "EEEE, MMM d, yyyy")}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                      {assignment.description || "No specific instructions provided."}
                    </p>
                    <div className="flex justify-end border-t pt-4">
                      <Button size="sm" asChild>
                        <Link href="/dashboard/student/assignments">
                          Go to Assignment
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-muted/20 border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mb-4 opacity-40" />
                <p className="text-lg font-medium text-foreground mb-1">No Assignments Yet</p>
                <p>Your instructor hasn't posted any assignments for this course.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
