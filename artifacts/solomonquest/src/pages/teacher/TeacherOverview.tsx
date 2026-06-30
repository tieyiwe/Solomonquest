import { useAuth } from "@/contexts/AuthContext";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import {
  useGetTeacherStats,
  useGetMyCourses,
  useListPendingAssignments,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Users,
  Clock,
  ArrowRight,
  Plus,
  Video,
  FolderOpen,
  FileText,
  ClipboardList,
  TrendingUp,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

export default function TeacherOverview() {
  const { user } = useAuth();
  const { data: stats, isLoading: isLoadingStats } = useGetTeacherStats();
  const { data: courses, isLoading: isLoadingCourses } = useGetMyCourses();
  const { data: pendingAssignments, isLoading: isLoadingPending } = useListPendingAssignments();

  const statCards = [
    {
      label: "Courses Teaching",
      value: stats?.totalCourses ?? 0,
      icon: BookOpen,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Students",
      value: stats?.totalStudents ?? 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      label: "Pending Grading",
      value: stats?.pendingGrading ?? 0,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100 dark:bg-amber-900/30",
    },
    {
      label: "Active Assignments",
      value: pendingAssignments?.length ?? 0,
      icon: FileText,
      color: "text-green-600",
      bg: "bg-green-100 dark:bg-green-900/30",
    },
  ];

  const quickActions = [
    {
      label: "Create Quiz",
      icon: ClipboardList,
      href: "/dashboard/teacher/quiz-builder",
      color: "text-purple-600",
      bg: "bg-purple-100 dark:bg-purple-900/30",
      description: "Build a new quiz for your students",
    },
    {
      label: "Add Resource",
      icon: FolderOpen,
      href: "/dashboard/teacher/resources",
      color: "text-blue-600",
      bg: "bg-blue-100 dark:bg-blue-900/30",
      description: "Upload files or add external links",
    },
    {
      label: "Start Video Class",
      icon: Video,
      href: courses?.[0] ? `/dashboard/teacher/courses/${courses[0].id}?tab=video` : "/dashboard/teacher",
      color: "text-green-600",
      bg: "bg-green-100 dark:bg-green-900/30",
      description: "Launch a live Jitsi video session",
    },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back, {user?.firstName || "Teacher"}!
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's what's happening in your classes today.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
            <Calendar className="h-4 w-4" />
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <div className={`h-8 w-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* My Courses */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">My Courses</h2>
              <Link href="/dashboard/teacher/gradebook">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  View Gradebook <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>

            {isLoadingCourses ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-xl" />
                ))}
              </div>
            ) : courses && courses.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map((course) => (
                  <Card
                    key={course.id}
                    className="hover:border-primary/50 transition-all hover:shadow-sm flex flex-col group"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                        <Badge
                          variant={course.isPublished ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {course.isPublished ? "Published" : "Draft"}
                        </Badge>
                      </div>
                      <CardTitle className="text-sm font-semibold line-clamp-2 mt-2">
                        {course.title}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {course.code} {course.term ? `• ${course.term}` : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 mt-auto">
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {course.studentCount || 0} students
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10 group-hover:bg-primary/10"
                          asChild
                        >
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
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mb-4">
                    <BookOpen className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-medium mb-1">No courses assigned</h3>
                  <p className="text-sm text-muted-foreground">
                    You don't have any courses assigned yet.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Quick Actions</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link key={action.label} href={action.href}>
                      <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer h-full">
                        <CardContent className="p-4 flex flex-col gap-2">
                          <div
                            className={`h-9 w-9 rounded-lg ${action.bg} flex items-center justify-center`}
                          >
                            <Icon className={`h-5 w-5 ${action.color}`} />
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{action.label}</div>
                            <div className="text-xs text-muted-foreground">{action.description}</div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar: Activity + Pending */}
          <div className="space-y-4">
            {/* Pending Assignments */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Needs Grading</h2>
              <Card>
                <CardContent className="p-0">
                  {isLoadingPending ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : pendingAssignments && pendingAssignments.length > 0 ? (
                    <div className="divide-y">
                      {pendingAssignments.slice(0, 5).map((assignment) => (
                        <Link
                          key={assignment.id}
                          href={`/dashboard/teacher/assignments`}
                        >
                          <div className="p-3 hover:bg-muted/50 transition-colors flex items-start gap-3 cursor-pointer">
                            <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                              <Clock className="h-3.5 w-3.5 text-amber-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium line-clamp-1">{assignment.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {assignment.courseTitle}
                                {assignment.dueDate && (
                                  <span className="ml-1">
                                    • Due {format(new Date(assignment.dueDate), "MMM d")}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                      <p className="text-sm text-muted-foreground">All caught up!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Recent Activity</h2>
              <Card>
                <CardContent className="p-0">
                  {isLoadingStats ? (
                    <div className="p-4 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
                    <div className="divide-y">
                      {stats.recentActivity.slice(0, 6).map((activity) => (
                        <div key={activity.id} className="p-3 flex gap-3">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                          <div>
                            <p className="text-sm text-foreground leading-tight">
                              {activity.description}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(activity.createdAt), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No recent activity</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
