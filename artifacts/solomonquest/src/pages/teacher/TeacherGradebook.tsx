import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetMyCourses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookOpen, ArrowRight, ClipboardList } from "lucide-react";

export default function TeacherGradebook() {
  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gradebook</h1>
          <p className="text-muted-foreground">Select a course to view detailed student grades and performance.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isCoursesLoading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)
          ) : courses && courses.length > 0 ? (
            courses.map(course => (
              <Card key={course.id} className="hover:shadow-md transition-shadow flex flex-col border-border">
                <CardHeader>
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl line-clamp-1">{course.title}</CardTitle>
                  <CardDescription>{course.code} • {course.term || "Ongoing"}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-4 flex items-center justify-between border-t">
                  <div className="text-sm text-muted-foreground">
                    {course.studentCount} Students Enrolled
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/teacher/courses/${course.id}/assignments`}>
                      Grade <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-16 border border-dashed rounded-xl bg-muted/10">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">No active courses</h3>
              <p className="text-muted-foreground">You are not assigned to teach any courses yet.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
