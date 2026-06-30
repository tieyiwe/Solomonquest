import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetStudentStats, useGetMyCourses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, CheckSquare, TrendingUp, Clock, ArrowRight, Star } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function StudentOverview() {
  const { data: stats, isLoading: isLoadingStats } = useGetStudentStats();
  const { data: courses, isLoading: isLoadingCourses } = useGetMyCourses();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Student Dashboard</h1>
          <p className="text-muted-foreground">Keep track of your classes and upcoming assignments.</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrolled Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats?.enrolledCourses || 0}</div>}
            </CardContent>
          </Card>
          <Card className="border-chart-4/30 bg-chart-4/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-chart-4 font-semibold">Pending Assignments</CardTitle>
              <CheckSquare className="h-4 w-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-chart-4">{stats?.pendingAssignments || 0}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Grade</CardTitle>
              <TrendingUp className="h-4 w-4 text-chart-2" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats?.averageGrade ? `${stats.averageGrade}%` : "N/A"}</div>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Courses */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">My Courses</h2>
            </div>
            
            {isLoadingCourses ? (
              <div className="space-y-4">
                {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
              </div>
            ) : courses && courses.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map(course => (
                  <Card key={course.id} className="hover:border-primary/50 transition-colors flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="line-clamp-2 text-lg">{course.title}</CardTitle>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                      <CardDescription>{course.code}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto pt-2 flex items-center justify-between border-t border-border">
                      <span className="text-sm font-medium text-foreground">
                        {course.teacherName}
                      </span>
                      <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10" asChild>
                        <Link href={`/dashboard/student/courses/${course.id}`}>
                          View <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Star className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-1 text-foreground">Welcome to SolomonQuest</h3>
                  <p className="text-muted-foreground">You're not enrolled in any courses yet. Once an administrator enrolls you, they will appear here.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar: Activity */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Recent Updates</h2>
            </div>
            <Card>
              <CardContent className="p-0">
                {isLoadingStats ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
                  <div className="divide-y">
                    {stats.recentActivity.map(activity => (
                      <div key={activity.id} className="p-4 flex gap-3 hover:bg-muted/30 transition-colors">
                        <div className="mt-1 bg-secondary/10 p-1.5 rounded-full shrink-0">
                          <Clock className="h-3 w-3 text-secondary" />
                        </div>
                        <div>
                          <p className="text-sm text-foreground">{activity.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No recent updates.
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
