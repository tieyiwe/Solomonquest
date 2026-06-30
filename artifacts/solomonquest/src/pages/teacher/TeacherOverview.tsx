import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetTeacherStats, useGetMyCourses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Users, Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function TeacherOverview() {
  const { data: stats, isLoading: isLoadingStats } = useGetTeacherStats();
  const { data: courses, isLoading: isLoadingCourses } = useGetMyCourses();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Teacher Dashboard</h1>
          <p className="text-muted-foreground">Welcome back. Here's what's happening in your classes.</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">My Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats?.totalCourses || 0}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Students</CardTitle>
              <Users className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats?.totalStudents || 0}</div>}
            </CardContent>
          </Card>
          <Card className="border-chart-2/50 bg-chart-2/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-chart-2 font-semibold">Pending Grading</CardTitle>
              <Clock className="h-4 w-4 text-chart-2" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-chart-2">{stats?.pendingGrading || 0}</div>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Courses */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold">My Courses</h2>
            
            {isLoadingCourses ? (
              <div className="space-y-4">
                {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
              </div>
            ) : courses && courses.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map(course => (
                  <Card key={course.id} className="hover:border-primary/50 transition-colors flex flex-col">
                    <CardHeader>
                      <CardTitle className="line-clamp-1">{course.title}</CardTitle>
                      <CardDescription>{course.code} &bull; {course.term || "Ongoing"}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-end">
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" /> {course.studentCount || 0}
                        </span>
                        <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10" asChild>
                          <Link href={`/dashboard/teacher/courses/${course.id}`}>
                            Manage <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mb-4">
                    <BookOpen className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-1">No courses assigned</h3>
                  <p className="text-muted-foreground">You don't have any courses assigned to you yet.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar: Activity */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Recent Activity</h2>
            <Card>
              <CardContent className="p-0">
                {isLoadingStats ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
                  <div className="divide-y">
                    {stats.recentActivity.map(activity => (
                      <div key={activity.id} className="p-4 flex gap-3">
                        <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                        <div>
                          <p className="text-sm text-foreground leading-tight">{activity.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No recent activity
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
