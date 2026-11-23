import { useState, useEffect } from "react";
import { AnnouncementsPanel } from "@/components/AnnouncementsPanel";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { AgentWidget } from "@/components/agent/AgentWidget";
import { NotesWidget } from "@/components/notes/NotesWidget";
import { StickyNotesLayer } from "@/components/notes/StickyNotesLayer";
import { TourOverlay, useTour } from "@/components/tour/TourOverlay";
import { HelpCenter, HelpButton } from "@/components/help/HelpCenter";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  HelpCircle,
  FileText,
  FolderOpen,
  MessageSquare,
  MessageCircle,
  Inbox,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Video,
  Clock,
  TrendingUp,
  Calendar,
  Star,
  AlertCircle,
  GraduationCap,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isFuture, parseISO } from "date-fns";
import { navIconActive, navIconIdle, navItemClass } from "@/components/layout/navStyles";
import AttendanceCheckin from "@/components/AttendanceCheckin";
import { MyCourseProgressBar } from "@/components/modules/MyCourseProgress";

// ─── apiFetch helper ──────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentStats {
  enrolledCourses?: number;
  pendingAssignments?: number;
  averageGrade?: number;
  applicationStatus?: string;
}

interface Course {
  id: string;
  title: string;
  code?: string;
  teacherName?: string;
  teacher_name?: string;
  // GET /courses/my is camelCase (isLive / classDate / classEndTime); the
  // snake_case names were never sent, so live classes never showed here.
  isLive?: boolean;
  classDate?: string | null;
  classEndTime?: string | null;
}

interface Grade {
  id: string;
  assignment_title?: string;
  assignmentTitle?: string;
  score?: number;
  max_score?: number;
  maxScore?: number;
  graded_at?: string;
  gradedAt?: string;
  course_title?: string;
  courseTitle?: string;
}

interface VideoSession {
  room_name?: string;
  jitsi_room?: string;
  room?: string;
  is_active?: boolean;
  status?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "S";
}

function formatStudentId(id?: string | null) {
  if (!id) return "SQ-00000000";
  const numeric = id.replace(/\D/g, "").slice(0, 8).padStart(8, "0");
  return `SQ-${numeric}`;
}

function formatDate(raw?: string | null) {
  if (!raw) return null;
  try {
    return format(new Date(raw), "MMM d, yyyy h:mm a");
  } catch {
    return raw;
  }
}

function gradeColor(pct: number) {
  if (pct >= 90) return "text-success";
  if (pct >= 75) return "text-primary";
  if (pct >= 60) return "text-warning";
  return "text-destructive";
}

// courses.class_date is a DATE column ("YYYY-MM-DD"); the only time of day
// is the free-text class_end_time. Formatting the date with "h:mm a" showed
// every live class as starting at 12:00 AM.
function liveClassLabel(classDate?: string | null, classEndTime?: string | null): string | null {
  if (!classDate) return null;
  try {
    const d = parseISO(classDate);
    const until = classEndTime ? ` · until ${classEndTime}` : "";
    if (classDate.length > 10) {
      return isToday(d) ? `Today at ${format(d, "h:mm a")}` : format(d, "EEE, MMM d 'at' h:mm a");
    }
    return `${isToday(d) ? "Today" : format(d, "EEE, MMM d")}${until}`;
  } catch {
    return classDate;
  }
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "/dashboard/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/student", label: "My Courses", icon: BookOpen, exact: true },
  { href: "/dashboard/student/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/dashboard/student/quizzes", label: "Quizzes", icon: HelpCircle },
  { href: "/dashboard/student/transcript", label: "Transcript", icon: FileText },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/student/tuition", label: "Tuition", icon: Wallet },
];

function Sidebar({ onClose, onOpenHelp }: { onClose?: () => void; onOpenHelp: () => void }) {
  const [location] = useLocation();
  const { signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="px-4 h-16 border-b border-sidebar-border flex items-center justify-between shrink-0">
        <Link href="/dashboard/student">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shrink-0" aria-hidden="true">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sidebar-accent-foreground font-semibold text-sm leading-tight">SolomonQuest</p>
              <p className="text-sidebar-foreground/60 text-xs">Student Portal</p>
            </div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} aria-label="Close navigation" className="p-1.5 rounded-md text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 md:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon: Icon, exact }, idx) => {
          const active = exact ? location === href : location.startsWith(href);
          return (
            <Link key={`${href}-${idx}`} href={href}>
              <button
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={navItemClass(active)}
              >
                <Icon className={active ? navIconActive : navIconIdle} aria-hidden="true" />
                <span className="flex-1 text-left">{label}</span>
              </button>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 mb-1"
          onClick={onOpenHelp}
        >
          <HelpCircle className="mr-2 h-3.5 w-3.5" />
          Help Center
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/15"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
  loading,
  highlight,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <Card className={`border shadow-sm ${highlight ? "border-warning/30" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`h-8 w-8 rounded-full ${bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className={`text-2xl font-bold capitalize ${highlight ? color : "text-foreground"}`}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StudentOverview() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { showTour, launchTour, closeTour } = useTour(user?.role as "student" | "staff" | null);

  const [stats, setStats] = useState<StudentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const [grades, setGrades] = useState<Grade[]>([]);
  const [gradesLoading, setGradesLoading] = useState(true);

  // Active Jitsi sessions keyed by course id
  const [activeSessions, setActiveSessions] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch<StudentStats>("/api/dashboard/student/stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    apiFetch<Course[]>("/api/courses/my")
      .then(setCourses)
      .catch(() => {})
      .finally(() => setCoursesLoading(false));

    apiFetch<Grade[]>("/api/grades/recent")
      .then((data) => setGrades(data.slice(0, 5)))
      .catch(() => {})
      .finally(() => setGradesLoading(false));
  }, []);

  // Fetch active video sessions for each enrolled course
  useEffect(() => {
    if (!courses.length) return;
    courses.forEach(async (course) => {
      try {
        const data = await apiFetch<VideoSession | VideoSession[]>(
          `/api/video/sessions?course_id=${course.id}`
        );
        const session = Array.isArray(data) ? data[0] : data;
        const room = session?.room_name || session?.jitsi_room || session?.room;
        const isActive = session?.is_active ?? session?.status === "active";
        if (room && isActive) {
          setActiveSessions((prev) => ({ ...prev, [course.id]: room }));
        }
      } catch {
        // ignore
      }
    });
  }, [courses]);

  // Close notif on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = () => setNotifOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [notifOpen]);

  const firstName = (user as any)?.firstName || (user as any)?.first_name || "Student";
  const studentId = formatStudentId(
    (user as any)?.uniqueStudentId || (user as any)?.unique_student_id || (user as any)?.id
  );

  const pendingAssignments = stats?.pendingAssignments ?? 0;
  const avgGrade = stats?.averageGrade;
  const appStatus = stats?.applicationStatus;

  // Upcoming live courses
  const upcomingLive = courses.filter((c) => {
    if (!c.isLive) return false;
    const raw = c.classDate;
    if (!raw) return true; // is_live but no date — still show
    try {
      const d = parseISO(raw);
      return isToday(d) || isFuture(d);
    } catch {
      return false;
    }
  });

  return (
    <div className="min-h-screen bg-muted/50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col h-screen sticky top-0">
        <Sidebar onOpenHelp={() => setHelpOpen(true)} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-64 flex flex-col h-full shadow-xl">
            <Sidebar onClose={() => setSidebarOpen(false)} onOpenHelp={() => setHelpOpen(true)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b flex items-center px-4 md:px-6 gap-3 sticky top-0 z-20">
          <Button aria-label="Open menu"
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-foreground hidden md:block">
              Student Dashboard
            </h1>
            <h1 className="text-base font-semibold text-foreground md:hidden">SolomonQuest</h1>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={(e) => {
                e.stopPropagation();
                setNotifOpen((o) => !o);
              }}
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {pendingAssignments > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold">
                  {pendingAssignments > 9 ? "9+" : pendingAssignments}
                </span>
              )}
            </Button>

            {notifOpen && (
              <div
                className="absolute right-0 top-10 w-72 bg-card rounded-xl shadow-lg border z-50 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Notifications</p>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setNotifOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {pendingAssignments > 0 ? (
                  <div className="px-4 py-3 flex items-start gap-3 hover:bg-muted/50">
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                      <AlertCircle className="h-3.5 w-3.5 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {pendingAssignments} assignment{pendingAssignments > 1 ? "s" : ""} pending
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Don&apos;t fall behind!</p>
                      <Link href="/dashboard/student/assignments">
                        <span className="text-xs text-primary font-medium cursor-pointer mt-1 inline-block hover:underline">
                          View assignments
                        </span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">You are all caught up!</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <NotificationBell />
          <ProfileMenu />
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-8">

            {/* Welcome Banner */}
            <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-gold/10 border p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-primary/30 shrink-0">
                <AvatarImage src={(user as any)?.avatarUrl || (user as any)?.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {getInitials((user as any)?.firstName, (user as any)?.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  Welcome back, {firstName}!
                </h2>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Here&apos;s what&apos;s happening with your learning today.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <Badge variant="secondary" className="text-xs font-mono tracking-wide">
                    ID: {studentId}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(), "EEEE, MMMM d, yyyy")}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/dashboard/student">
                <StatCard
                  title="Enrolled Courses"
                  value={stats?.enrolledCourses ?? 0}
                  icon={BookOpen}
                  color="text-primary"
                  bg="bg-primary/10"
                  loading={statsLoading}
                />
              </Link>
              <Link href="/dashboard/student/assignments">
                <StatCard
                  title="Pending Assignments"
                  value={pendingAssignments}
                  icon={ClipboardList}
                  color="text-warning"
                  bg="bg-warning/10"
                  loading={statsLoading}
                  highlight={pendingAssignments > 0}
                />
              </Link>
              <Link href="/dashboard/student/transcript">
                <StatCard
                  title="Average Grade"
                  value={avgGrade != null ? `${avgGrade}%` : "N/A"}
                  icon={TrendingUp}
                  color="text-success"
                  bg="bg-success/10"
                  loading={statsLoading}
                />
              </Link>
              <div>
                <StatCard
                  title="Application Status"
                  value={appStatus ? appStatus.replace(/_/g, " ") : "N/A"}
                  icon={Inbox}
                  color="text-primary"
                  bg="bg-primary/10"
                  loading={statsLoading}
                />
              </div>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Left: Courses + Live sessions */}
              <div className="lg:col-span-2 space-y-8">

                {/* Enrolled Courses */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      My Courses
                    </h3>
                    <Link href="/dashboard/student">
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                        View all <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>

                  {coursesLoading ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
                    </div>
                  ) : courses.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {courses.map((course) => {
                        const activeRoom = activeSessions[course.id];
                        const classDisplay = course.isLive ? liveClassLabel(course.classDate, course.classEndTime) : null;

                        return (
                          <Card
                            key={course.id}
                            className="hover:border-primary/50 transition-colors flex flex-col"
                          >
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <BookOpen className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex gap-1.5">
                                  {course.isLive && (
                                    <Badge className="text-xs gap-1 bg-destructive hover:bg-destructive/90">
                                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                      Live
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <CardTitle className="text-sm font-semibold line-clamp-2 mt-2">
                                {course.title}
                              </CardTitle>
                              {course.code && (
                                <CardDescription className="text-xs">{course.code}</CardDescription>
                              )}
                            </CardHeader>
                            <CardContent className="pt-0 space-y-2">
                              {(course.teacherName || course.teacher_name) && (
                                <p className="text-xs text-muted-foreground">
                                  {course.teacherName || course.teacher_name}
                                </p>
                              )}
                              {classDisplay && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {classDisplay}
                                </p>
                              )}
                              <MyCourseProgressBar courseId={course.id} />
                              <div className="flex items-center gap-2 pt-1">
                                {activeRoom ? (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs gap-1 bg-success hover:bg-success/90"
                                    onClick={() =>
                                      window.open(
                                        `https://meet.jit.si/${activeRoom}`,
                                        "_blank",
                                        "noopener,noreferrer"
                                      )
                                    }
                                  >
                                    <Video className="h-3 w-3" />
                                    Join Now
                                  </Button>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-primary hover:bg-primary/10 gap-1 ml-auto"
                                  asChild
                                >
                                  <Link href={`/dashboard/student/courses/${course.id}`}>
                                    Open <ChevronRight className="h-3 w-3" />
                                  </Link>
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <Card className="bg-muted/30 border-dashed">
                      <CardContent className="flex flex-col items-center justify-center p-10 text-center">
                        <Star className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                        <h3 className="text-base font-medium mb-1">No courses yet</h3>
                        <p className="text-sm text-muted-foreground">
                          Once enrolled, your courses will appear here.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Live-class self check-in (POST /attendance/checkin only
                    accepts a course that is live with class_date = today).
                    The AttendanceCheckin card existed but was never mounted,
                    so students had no way to check in. */}
                <AttendanceCheckin
                  courses={upcomingLive
                    .filter((c) => {
                      try { return !!c.classDate && isToday(parseISO(c.classDate)); } catch { return false; }
                    })
                    .map((c) => ({ id: c.id, name: c.title, class_date: c.classDate as string }))}
                />

                {/* Upcoming Live Classes */}
                {upcomingLive.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Video className="h-5 w-5 text-primary" />
                      Upcoming Live Classes
                    </h3>
                    <div className="space-y-3">
                      {upcomingLive.map((course) => {
                        const activeRoom = activeSessions[course.id];
                        const classDisplay = liveClassLabel(course.classDate, course.classEndTime);
                        return (
                          <Card
                            key={course.id}
                            className="border-success/30 bg-success/10"
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                                  <Video className="h-5 w-5 text-success" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm text-foreground truncate">
                                    {course.title}
                                  </p>
                                  {classDisplay && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Clock className="h-3 w-3" />
                                      {classDisplay}
                                    </p>
                                  )}
                                </div>
                                {activeRoom ? (
                                  <Button
                                    size="sm"
                                    className="bg-success hover:bg-success/90 shrink-0 gap-1"
                                    onClick={() =>
                                      window.open(
                                        `https://meet.jit.si/${activeRoom}`,
                                        "_blank",
                                        "noopener,noreferrer"
                                      )
                                    }
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                    Join Now
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
              </div>

              {/* Right: Recent Grades + Quick Links */}
              <div className="space-y-8">

                <AnnouncementsPanel title="Announcements" limit={5} />

                {/* Recent Grades */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    Recent Grades
                  </h3>
                  <Card>
                    <CardContent className="p-0">
                      {gradesLoading ? (
                        <div className="p-4 space-y-3">
                          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                      ) : grades.length > 0 ? (
                        <div className="divide-y">
                          {grades.map((g) => {
                            const title = g.assignmentTitle || g.assignment_title || "Assignment";
                            const score = g.score ?? 0;
                            const max = g.maxScore || g.max_score || 100;
                            const pct = max > 0 ? Math.round((score / max) * 100) : 0;
                            const gradedAt = g.gradedAt || g.graded_at;
                            return (
                              <div key={g.id} className="p-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{title}</p>
                                  {(g.courseTitle || g.course_title) && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {g.courseTitle || g.course_title}
                                    </p>
                                  )}
                                  {gradedAt && (
                                    <p className="text-xs text-muted-foreground/60">
                                      {formatDate(gradedAt)}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className={`text-sm font-bold ${gradeColor(pct)}`}>
                                    {score}/{max}
                                  </p>
                                  <p className={`text-xs ${gradeColor(pct)}`}>{pct}%</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-8 text-center">
                          <Star className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No grades yet.</p>
                        </div>
                      )}
                    </CardContent>
                    {grades.length > 0 && (
                      <div className="px-3 pb-3">
                        <Link href="/dashboard/student/transcript">
                          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground gap-1">
                            View Full Transcript <ChevronRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    )}
                  </Card>
                </div>

                {/* Quick Links */}
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-foreground">Quick Links</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Assignments", href: "/dashboard/student/assignments", icon: ClipboardList },
                      { label: "Quizzes", href: "/dashboard/student/quizzes", icon: HelpCircle },
                      { label: "Transcript", href: "/dashboard/student/transcript", icon: FileText },
                      { label: "Forum", href: "/forum", icon: MessageSquare },
                    ].map(({ label, href, icon: Icon }) => (
                      <Button
                        key={href}
                        variant="outline"
                        className="h-auto py-3 flex flex-col items-center gap-1.5 text-xs font-medium"
                        asChild
                      >
                        <Link href={href}>
                          <Icon className="h-4 w-4 text-primary" />
                          {label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>

              </div>
            </div>

          </div>
        </main>
      </div>

      <AgentWidget />
      <NotesWidget />
      <StickyNotesLayer />
      <HelpButton onClick={() => setHelpOpen(true)} />
      {helpOpen && (
        <HelpCenter
          role={user?.role as "student" | "staff"}
          onClose={() => setHelpOpen(false)}
          onStartTour={launchTour}
        />
      )}
      {showTour && <TourOverlay role={user?.role as "student" | "staff"} onClose={closeTour} />}
    </div>
  );
}
