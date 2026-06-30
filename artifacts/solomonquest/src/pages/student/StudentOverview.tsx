import { useState } from "react";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetStudentStats,
  useGetMyCourses,
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useListApplications,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CheckSquare,
  TrendingUp,
  ArrowRight,
  Star,
  Bell,
  BellOff,
  Calendar,
  Clock,
  Check,
  ChevronRight,
  School,
  AlertCircle,
} from "lucide-react";
import { format, isWithinInterval, addDays } from "date-fns";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const APPLICATION_STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "received", label: "Received" },
  { key: "under_review", label: "Under Review" },
  { key: "finalizing", label: "Finalizing" },
  { key: "approved", label: "Approved" },
];

const STATUS_STEP_MAP: Record<string, number> = {
  submitted: 0,
  received: 1,
  under_review: 2,
  reviewing: 2,
  finalizing: 3,
  approved: 4,
  rejected: -1,
};

function ApplicationStatusTracker({ status }: { status: string }) {
  const currentStep = STATUS_STEP_MAP[status] ?? 0;
  const isRejected = status === "rejected";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Application in Progress</CardTitle>
        </div>
        <CardDescription>Your application is being reviewed. Here is the current status.</CardDescription>
      </CardHeader>
      <CardContent>
        {isRejected ? (
          <div className="flex items-center gap-2 text-destructive font-medium">
            <AlertCircle className="h-4 w-4" />
            Your application was not approved at this time.
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              {APPLICATION_STEPS.map((step, idx) => (
                <div key={step.key} className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 relative",
                      idx < currentStep
                        ? "bg-primary border-primary text-primary-foreground"
                        : idx === currentStep
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-muted border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {idx < currentStep ? <Check className="h-4 w-4" /> : idx + 1}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-1.5 text-center hidden sm:block",
                      idx <= currentStep ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted -z-0">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{
                  width: `${currentStep === 0 ? 0 : (currentStep / (APPLICATION_STEPS.length - 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StudentOverview() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  const { data: stats, isLoading: isLoadingStats } = useGetStudentStats();
  const { data: courses, isLoading: isLoadingCourses } = useGetMyCourses();
  const { data: notifications, isLoading: isLoadingNotifs } = useListNotifications();
  const { data: applications, isLoading: isLoadingApps } = useListApplications();

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const pendingApplication = applications?.find(
    (a) => a.status !== "approved" && a.status !== "rejected"
  );
  const hasNoCourses = !isLoadingCourses && (!courses || courses.length === 0);
  const hasNoApplication = !isLoadingApps && !pendingApplication && hasNoCourses;

  const unreadNotifs = notifications?.filter((n) => !n.isRead) ?? [];
  const displayedNotifs = showAllNotifications
    ? (notifications ?? []).slice(0, 5)
    : unreadNotifs.slice(0, 5);

  const upcomingAssignments = stats?.recentActivity?.filter((a) => {
    return a.type === "assignment";
  }) ?? [];

  const handleMarkRead = (id: string) => {
    markRead.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        },
      }
    );
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        toast.success("All notifications marked as read");
      },
    });
  };

  return (
    <StudentLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back, {user?.firstName || "Student"}!
            </h1>
            <p className="text-muted-foreground mt-0.5">
              Here is what is happening with your learning today.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </div>
        </div>

        {pendingApplication && (
          <ApplicationStatusTracker status={pendingApplication.status} />
        )}

        {hasNoApplication && (
          <Card className="border-dashed border-2 bg-muted/20">
            <CardContent className="flex flex-col sm:flex-row items-center gap-6 p-6">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <School className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="font-semibold text-foreground text-lg">Find a School to Join</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  You are not enrolled in any school yet. Browse available schools and apply to get started.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href="/">
                  Browse Schools
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Enrolled Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold">{stats?.enrolledCourses ?? 0}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-900/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">Pending Assignments</CardTitle>
              <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold text-orange-700 dark:text-orange-400">
                  {stats?.pendingAssignments ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Average Grade</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold">
                  {stats?.averageGrade != null ? `${stats.averageGrade}%` : "N/A"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">My Courses</h2>
              {courses && courses.length > 0 && (
                <span className="text-sm text-muted-foreground">{courses.length} enrolled</span>
              )}
            </div>

            {isLoadingCourses ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-xl" />
                ))}
              </div>
            ) : courses && courses.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map((course) => (
                  <Card
                    key={course.id}
                    className="hover:border-primary/50 transition-colors flex flex-col group"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="line-clamp-2 text-base leading-snug group-hover:text-primary transition-colors">
                          {course.title}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                      {course.code && (
                        <Badge variant="secondary" className="w-fit text-xs">
                          {course.code}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="mt-auto pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{course.teacherName}</p>
                          {course.term && (
                            <p className="text-xs text-muted-foreground">{course.term}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:bg-primary/10 gap-1"
                          asChild
                        >
                          <Link href={`/dashboard/student/courses/${course.id}`}>
                            View
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !hasNoApplication ? (
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Star className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
                  <h3 className="text-lg font-medium mb-1">No Courses Yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Once your application is approved and you are enrolled, your courses will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {stats?.recentActivity && stats.recentActivity.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Recent Activity</h2>
                <div className="space-y-2">
                  {stats.recentActivity.slice(0, 5).map((activity) => (
                    <div
                      key={activity.id}
                      className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Notifications</h2>
                <div className="flex items-center gap-2">
                  {unreadNotifs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                      onClick={handleMarkAllRead}
                      disabled={markAllRead.isPending}
                    >
                      Mark all read
                    </Button>
                  )}
                  {unreadNotifs.length > 0 && (
                    <Badge variant="destructive" className="h-5 text-xs px-1.5">
                      {unreadNotifs.length}
                    </Badge>
                  )}
                </div>
              </div>

              <Card>
                {isLoadingNotifs ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : notifications && notifications.length > 0 ? (
                  <>
                    <div className="divide-y">
                      {(showAllNotifications
                        ? notifications.slice(0, 5)
                        : unreadNotifs.slice(0, 5)
                      ).map((notif) => (
                        <div
                          key={notif.id}
                          className={cn(
                            "p-3 flex gap-3 transition-colors",
                            !notif.isRead ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                          )}
                        >
                          <div className="mt-0.5 shrink-0">
                            {!notif.isRead ? (
                              <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-muted-foreground/30 mt-1.5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {notif.title && (
                              <p className="text-sm font-medium text-foreground truncate">
                                {notif.title}
                              </p>
                            )}
                            {notif.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notif.body}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {format(new Date(notif.createdAt), "MMM d, h:mm a")}
                            </p>
                          </div>
                          {!notif.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                              onClick={() => handleMarkRead(notif.id)}
                              disabled={markRead.isPending}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground"
                        onClick={() => setShowAllNotifications(!showAllNotifications)}
                      >
                        {showAllNotifications
                          ? "Show unread only"
                          : `Show all (${notifications.length})`}
                      </Button>
                    </div>
                  </>
                ) : (
                  <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                    <BellOff className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No notifications</p>
                  </CardContent>
                )}
              </Card>
            </div>

            {stats?.pendingAssignments != null && stats.pendingAssignments > 0 && (
              <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-900/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                      <CheckSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-orange-700 dark:text-orange-400">
                        {stats.pendingAssignments} Assignment{stats.pendingAssignments !== 1 ? "s" : ""} Due
                      </p>
                      <p className="text-xs text-orange-600/70 dark:text-orange-400/70">
                        Don&apos;t fall behind
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-900/30"
                      asChild
                    >
                      <Link href="/dashboard/student/assignments">
                        View
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
