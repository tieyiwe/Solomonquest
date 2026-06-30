import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import {
  useGetStudentStats,
  useGetMyCourses,
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useListApplications,
  useListAnnouncements,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  CheckSquare,
  TrendingUp,
  ArrowRight,
  Bell,
  BellOff,
  Calendar,
  Clock,
  Check,
  ChevronRight,
  School,
  AlertCircle,
  LayoutDashboard,
  FileText,
  FolderOpen,
  MessageSquare,
  GraduationCap,
  LogOut,
  Menu,
  X,
  Video,
  Megaphone,
  Star,
  FileQuestion,
  Send,
  Briefcase,
} from "lucide-react";
import { format, isToday, isFuture, parseISO } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatStudentId(id?: string | null): string {
  if (!id) return "SQ-00000000";
  const numeric = id.replace(/\D/g, "").slice(0, 8).padStart(8, "0");
  return `SQ-${numeric}`;
}

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "S";
}

// ── Application Status Tracker ────────────────────────────────────────────────

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
        <CardDescription>
          Your application is being processed. Track your progress below.
        </CardDescription>
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

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "/dashboard/student", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/student/courses", label: "My Courses", icon: BookOpen, exact: false },
  { href: "/dashboard/student/assignments", label: "Assignments", icon: FileText, exact: false },
  { href: "/dashboard/student/quizzes", label: "Quizzes", icon: FileQuestion, exact: false },
  { href: "/dashboard/student/transcript", label: "Grades & Transcript", icon: TrendingUp, exact: false },
  { href: "/dashboard/student/resources", label: "Resources", icon: FolderOpen, exact: false },
  { href: "/forum", label: "Forum", icon: MessageSquare, exact: false },
  { href: "/chat", label: "Chat", icon: Send, exact: false },
  { href: "/dashboard/student/applications", label: "Applications", icon: Briefcase, exact: false },
];

interface SidebarProps {
  onClose?: () => void;
}

function Sidebar({ onClose }: SidebarProps) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();

  const isActive = (href: string, exact: boolean) => {
    if (exact) return location === href;
    return location === href || location.startsWith(href + "/");
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border flex items-center justify-between h-16 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
            <GraduationCap className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <Link href="/">
            <span className="text-base font-bold text-sidebar-primary tracking-tight">SolomonQuest</span>
          </Link>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="md:hidden h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV_LINKS.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, link.exact);
          return (
            <Button
              key={link.href}
              variant="ghost"
              className={cn(
                "w-full justify-start h-9 px-3 text-sm font-medium",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
              asChild
              onClick={onClose}
            >
              <Link href={link.href}>
                <Icon className="mr-2.5 h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 mb-3 px-2 py-2 rounded-lg">
          <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
            <AvatarImage src={user?.avatarUrl || ""} />
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-xs text-sidebar-foreground/50 truncate">
              {formatStudentId(user?.id)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 h-9 text-sm"
          onClick={signOut}
        >
          <LogOut className="mr-2.5 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

// ── Notification Panel ────────────────────────────────────────────────────────

function NotificationPanel() {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unread = notifications?.filter((n) => !n.isRead) ?? [];
  const displayed = showAll
    ? (notifications ?? []).slice(0, 6)
    : unread.slice(0, 6);

  const handleMarkRead = (id: string) => {
    markRead.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) }
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-foreground" />
          <h2 className="text-base font-semibold">Notifications</h2>
          {unread.length > 0 && (
            <Badge variant="destructive" className="h-5 text-xs px-1.5">
              {unread.length}
            </Badge>
          )}
        </div>
        {unread.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-7 px-2"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
          >
            Mark all read
          </Button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : displayed.length > 0 ? (
          <>
            <div className="divide-y">
              {displayed.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "p-3 flex gap-3 transition-colors",
                    !notif.isRead ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                  )}
                >
                  <div className="mt-1.5 shrink-0">
                    <div className={cn("h-2 w-2 rounded-full", !notif.isRead ? "bg-primary" : "bg-muted-foreground/30")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {notif.title && (
                      <p className="text-sm font-medium text-foreground truncate">{notif.title}</p>
                    )}
                    {notif.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-1">
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
            {notifications && notifications.length > 5 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? "Show unread only" : `Show all (${notifications.length})`}
                </Button>
              </div>
            )}
          </>
        ) : (
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <BellOff className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No notifications</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StudentOverview() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: stats, isLoading: isLoadingStats } = useGetStudentStats();
  const { data: courses, isLoading: isLoadingCourses } = useGetMyCourses();
  const { data: applications, isLoading: isLoadingApps } = useListApplications();
  const { data: announcements, isLoading: isLoadingAnnouncements } = useListAnnouncements();
  const { data: notifications } = useListNotifications();

  // Per-course active video session state
  const [activeSessions, setActiveSessions] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!courses || courses.length === 0) return;
    courses.forEach(async (course) => {
      try {
        const res = await fetch(`/api/video/sessions?course_id=${course.id}`);
        if (res.ok) {
          const data = await res.json();
          // API returns active session object or null/empty
          const session = Array.isArray(data) ? data[0] : data;
          if (session && session.jitsi_room && session.status === "active") {
            setActiveSessions((prev) => ({ ...prev, [course.id]: session.jitsi_room }));
          }
        }
      } catch {
        // ignore
      }
    });
  }, [courses]);

  const pendingApplication = applications?.find(
    (a) => a.status !== "approved" && a.status !== "rejected"
  );
  const hasNoCourses = !isLoadingCourses && (!courses || courses.length === 0);
  const hasNoApplication = !isLoadingApps && !pendingApplication && hasNoCourses;

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  // Courses with upcoming live class sessions
  const upcomingLiveCourses = (courses ?? []).filter((c: any) => {
    const isLive = c.is_live;
    const classDate = c.class_date;
    if (!isLive || !classDate) return false;
    try {
      const parsed = parseISO(classDate);
      return isToday(parsed) || isFuture(parsed);
    } catch {
      return false;
    }
  });

  const recentAnnouncements = (announcements ?? []).slice(0, 5);

  // Stat cards
  const statCards = [
    {
      label: "Enrolled Courses",
      value: stats?.enrolledCourses ?? 0,
      icon: BookOpen,
      color: "text-primary",
      bg: "bg-primary/10",
      link: "/dashboard/student/courses",
    },
    {
      label: "Pending Assignments",
      value: stats?.pendingAssignments ?? 0,
      icon: CheckSquare,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-100 dark:bg-orange-900/30",
      link: "/dashboard/student/assignments",
      highlight: (stats?.pendingAssignments ?? 0) > 0,
    },
    {
      label: "Quiz Score Avg",
      value: stats?.averageGrade != null ? `${stats.averageGrade}%` : "N/A",
      icon: TrendingUp,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-100 dark:bg-green-900/30",
      link: "/dashboard/student/quizzes",
    },
    {
      label: "Application Status",
      value: pendingApplication
        ? pendingApplication.status.replace(/_/g, " ")
        : applications?.find((a) => a.status === "approved")
        ? "Approved"
        : "N/A",
      icon: Briefcase,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-900/30",
      link: "/dashboard/student/applications",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r h-screen sticky top-0 shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 h-full shadow-xl">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold text-foreground hidden md:block">Student Dashboard</span>
            <span className="font-bold text-primary md:hidden">SolomonQuest</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-full relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
            <Avatar className="h-8 w-8 border">
              <AvatarImage src={user?.avatarUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {getInitials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* Welcome banner */}
            <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-background border p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary/30 shrink-0">
                <AvatarImage src={user?.avatarUrl || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {getInitials(user?.firstName, user?.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Welcome back, {user?.firstName || "Student"}!
                </h1>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Here is what is happening with your learning today.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <Badge variant="secondary" className="text-xs font-mono tracking-wide">
                    Student ID: {formatStudentId(user?.id)}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(), "EEEE, MMMM d, yyyy")}
                  </span>
                </div>
              </div>
            </div>

            {/* Application tracker */}
            {pendingApplication && (
              <ApplicationStatusTracker status={pendingApplication.status} />
            )}

            {/* No school / no application prompt */}
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

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Link key={card.label} href={card.link}>
                    <Card className={cn(
                      "hover:border-primary/40 transition-all cursor-pointer group",
                      card.highlight && "border-orange-300 dark:border-orange-800"
                    )}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          {card.label}
                        </CardTitle>
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", card.bg)}>
                          <Icon className={cn("h-4 w-4", card.color)} />
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {isLoadingStats ? (
                          <Skeleton className="h-8 w-16" />
                        ) : (
                          <div className={cn("text-2xl font-bold capitalize", card.highlight && card.color)}>
                            {card.value}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Main grid: left = courses + upcoming; right = notifications + announcements */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Left column */}
              <div className="lg:col-span-2 space-y-8">

                {/* My Courses */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      My Courses
                    </h2>
                    <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground">
                      <Link href="/dashboard/student/courses">
                        View all
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>

                  {isLoadingCourses ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                    </div>
                  ) : courses && courses.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {courses.map((course) => {
                        const activeRoom = activeSessions[course.id];
                        const progress = Math.floor(Math.random() * 60 + 20); // placeholder until API provides it
                        return (
                          <Card
                            key={course.id}
                            className="hover:border-primary/50 transition-colors flex flex-col group"
                          >
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <CardTitle className="line-clamp-2 text-sm leading-snug group-hover:text-primary transition-colors">
                                  {course.title}
                                </CardTitle>
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <BookOpen className="h-4 w-4 text-primary" />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {course.code && (
                                  <Badge variant="secondary" className="text-xs w-fit">
                                    {course.code}
                                  </Badge>
                                )}
                                {(course as any).is_live && (
                                  <Badge className="text-xs w-fit bg-red-500 hover:bg-red-600">
                                    <span className="h-1.5 w-1.5 rounded-full bg-white mr-1 animate-pulse" />
                                    Live
                                  </Badge>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="pt-2 space-y-3">
                              <div>
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                  <span>Progress</span>
                                  <span>{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-1.5" />
                              </div>
                              <div className="flex items-center justify-between">
                                <div>
                                  {course.teacherName && (
                                    <p className="text-xs text-muted-foreground">{course.teacherName}</p>
                                  )}
                                  {course.term && (
                                    <p className="text-xs text-muted-foreground/70">{course.term}</p>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  {activeRoom && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                                      onClick={() =>
                                        window.open(`https://meet.jit.si/${activeRoom}`, "_blank", "noopener,noreferrer")
                                      }
                                    >
                                      <Video className="h-3 w-3" />
                                      Join Live
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-primary hover:bg-primary/10 gap-1"
                                    asChild
                                  >
                                    <Link href={`/dashboard/student/courses/${course.id}`}>
                                      Open
                                      <ArrowRight className="h-3 w-3" />
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : !hasNoApplication ? (
                    <Card className="bg-muted/30 border-dashed">
                      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <Star className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
                        <h3 className="text-lg font-medium mb-1">No Courses Yet</h3>
                        <p className="text-muted-foreground text-sm">
                          Once your application is approved you will be enrolled in courses.
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>

                {/* Upcoming Live Sessions */}
                {upcomingLiveCourses.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Video className="h-5 w-5 text-primary" />
                      Upcoming Live Classes
                    </h2>
                    <div className="space-y-3">
                      {upcomingLiveCourses.map((course: any) => {
                        const parsedDate = course.class_date ? parseISO(course.class_date) : null;
                        const activeRoom = activeSessions[course.id];
                        return (
                          <Card key={course.id} className="border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-900/5">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                  <Video className="h-5 w-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm text-foreground truncate">{course.title}</p>
                                  {parsedDate && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Clock className="h-3 w-3" />
                                      {isToday(parsedDate)
                                        ? `Today at ${format(parsedDate, "h:mm a")}`
                                        : format(parsedDate, "EEEE, MMM d 'at' h:mm a")}
                                    </p>
                                  )}
                                </div>
                                {activeRoom ? (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 shrink-0 gap-1"
                                    onClick={() =>
                                      window.open(`https://meet.jit.si/${activeRoom}`, "_blank", "noopener,noreferrer")
                                    }
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                    Join Live Class
                                  </Button>
                                ) : (
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    Scheduled
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                {stats?.recentActivity && stats.recentActivity.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Recent Activity
                    </h2>
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

              {/* Right column */}
              <div className="space-y-8">

                {/* Notifications */}
                <NotificationPanel />

                {/* Pending assignments reminder */}
                {(stats?.pendingAssignments ?? 0) > 0 && (
                  <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-900/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                          <CheckSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-orange-700 dark:text-orange-400">
                            {stats!.pendingAssignments} Assignment{stats!.pendingAssignments !== 1 ? "s" : ""} Pending
                          </p>
                          <p className="text-xs text-orange-600/70 dark:text-orange-400/70">
                            Don&apos;t fall behind — submit on time
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-auto border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-900/30 shrink-0"
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

                {/* Announcements */}
                <div className="space-y-3">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Announcements
                  </h2>
                  <Card>
                    {isLoadingAnnouncements ? (
                      <div className="p-4 space-y-3">
                        {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                      </div>
                    ) : recentAnnouncements.length > 0 ? (
                      <div className="divide-y">
                        {recentAnnouncements.map((ann) => (
                          <div key={ann.id} className="p-4 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start gap-2">
                              {ann.isPinned && (
                                <Badge className="text-xs shrink-0 mt-0.5">Pinned</Badge>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground line-clamp-1">
                                  {ann.title}
                                </p>
                                {ann.content && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {ann.content}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(ann.createdAt), "MMM d, yyyy")}
                                  {ann.postedByName && ` · ${ann.postedByName}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                        <Megaphone className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">No announcements</p>
                      </CardContent>
                    )}
                  </Card>
                </div>

                {/* Quick links */}
                <div className="space-y-3">
                  <h2 className="text-base font-semibold text-foreground">Quick Links</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Assignments", href: "/dashboard/student/assignments", icon: FileText },
                      { label: "Quizzes", href: "/dashboard/student/quizzes", icon: FileQuestion },
                      { label: "Transcript", href: "/dashboard/student/transcript", icon: TrendingUp },
                      { label: "Forum", href: "/forum", icon: MessageSquare },
                    ].map((link) => {
                      const Icon = link.icon;
                      return (
                        <Button
                          key={link.href}
                          variant="outline"
                          className="h-auto py-3 flex flex-col items-center gap-1 text-xs font-medium"
                          asChild
                        >
                          <Link href={link.href}>
                            <Icon className="h-4 w-4 text-primary" />
                            {link.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
