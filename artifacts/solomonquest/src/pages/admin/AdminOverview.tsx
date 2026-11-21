import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { AgentWidget } from "@/components/agent/AgentWidget";
import { NotesWidget } from "@/components/notes/NotesWidget";
import { StickyNotesLayer } from "@/components/notes/StickyNotesLayer";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  FolderOpen,
  MessageSquare,
  MessageCircle,
  BarChart2,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronRight,
  AlertCircle,
  GraduationCap,
  UserPlus,
  ClipboardList,
  Loader2,
  Send,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { navIconActive, navIconIdle, navItemClass } from "@/components/layout/navStyles";

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

interface DashboardStats {
  totalStudents?: number;
  totalTeachers?: number;
  totalCourses?: number;
  pendingApplications?: number;
}

interface UserRow {
  id: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  unique_student_id?: string;
  uniqueStudentId?: string;
  created_at?: string;
  createdAt?: string;
  status?: string;
  avatar_url?: string;
  avatarUrl?: string;
  courses_count?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "U";
}

function displayName(u: UserRow) {
  const first = u.firstName || u.first_name || "";
  const last = u.lastName || u.last_name || "";
  return `${first} ${last}`.trim() || "—";
}

function formatDate(raw?: string | null) {
  if (!raw) return "—";
  try {
    return format(new Date(raw), "MMM d, yyyy h:mm a");
  } catch {
    return raw;
  }
}

function roleBadgeClass(role?: string | null) {
  switch (role) {
    case "admin":
    case "super_admin":
      return "bg-chart-5/10 text-chart-5 border-chart-5/30";
    case "teacher":
      return "bg-primary/10 text-primary border-primary/30";
    case "student":
      return "bg-success/10 text-success border-success/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusBadgeClass(status?: string | null) {
  switch (status?.toLowerCase()) {
    case "active":
    case "approved":
      return "bg-success/10 text-success border-success/30";
    case "rejected":
      return "bg-destructive/10 text-destructive border-destructive/30";
    default:
      return "bg-warning/10 text-warning border-warning/30";
  }
}

function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-[140px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "/dashboard/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: FileText },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="px-4 h-16 border-b border-sidebar-border flex items-center justify-between shrink-0">
        <Link href="/dashboard/admin">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm shrink-0" aria-hidden="true">
              S
            </div>
            <div>
              <p className="text-sidebar-accent-foreground font-semibold text-sm leading-tight">SolomonQuest</p>
              <p className="text-sidebar-foreground/60 text-xs">Admin Panel</p>
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
      <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? location === href : location.startsWith(href);
          return (
            <Link key={href} href={href}>
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

      {/* User footer */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
          <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
            <AvatarImage src={(user as any)?.avatarUrl || (user as any)?.avatar_url || ""} />
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
              {getInitials((user as any)?.firstName, (user as any)?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sidebar-accent-foreground text-sm font-medium truncate">
              {(user as any)?.firstName} {(user as any)?.lastName}
            </p>
            <p className="text-sidebar-foreground/60 text-xs capitalize truncate">
              {(user as any)?.role?.replace("_", " ")}
            </p>
          </div>
        </div>
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
  loading,
  sub,
}: {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  color: string;
  loading: boolean;
  sub?: string;
}) {
  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-9 w-20 mt-1" />
            ) : (
              <p className="text-3xl font-bold tracking-tight mt-1 text-foreground">{value ?? 0}</p>
            )}
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color} shrink-0`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminOverview() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [students, setStudents] = useState<UserRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  const [teachers, setTeachers] = useState<UserRow[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(true);

  // Release Transcripts dialog state
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [releaseSemester, setReleaseSemester] = useState("");
  const [releaseMessage, setReleaseMessage] = useState("");
  const [releasing, setReleasing] = useState(false);

  async function handleReleaseTranscripts() {
    setReleasing(true);
    try {
      const result = await apiFetch<{ success: boolean; notified: number }>("/api/transcripts/release", {
        method: "POST",
        body: JSON.stringify({ semester: releaseSemester || undefined, message: releaseMessage || undefined }),
      });
      toast.success(`Transcripts released. ${result.notified} student(s) notified.`);
      setReleaseDialogOpen(false);
      setReleaseSemester("");
      setReleaseMessage("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to release transcripts");
    } finally {
      setReleasing(false);
    }
  }

  useEffect(() => {
    apiFetch<DashboardStats>("/api/dashboard/admin/stats")
      .then(setStats)
      .catch(() => toast.error("Failed to load dashboard stats"))
      .finally(() => setStatsLoading(false));

    apiFetch<UserRow[]>("/api/users?role=student")
      .then((data) => setStudents(data.slice(0, 6)))
      .catch(() => {})
      .finally(() => setStudentsLoading(false));

    apiFetch<UserRow[]>("/api/users?role=teacher")
      .then((data) => setTeachers(data.slice(0, 6)))
      .catch(() => {})
      .finally(() => setTeachersLoading(false));
  }, []);

  const pendingCount = stats?.pendingApplications ?? 0;

  // Close notif on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = () => setNotifOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [notifOpen]);

  return (
    <div className="min-h-screen bg-muted/50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col h-screen sticky top-0">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 w-64 flex flex-col h-full shadow-xl">
            <Sidebar onClose={() => setSidebarOpen(false)} />
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
              Dashboard Overview
            </h1>
            <h1 className="text-base font-semibold text-foreground md:hidden">SolomonQuest</h1>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <Button aria-label="Notifications"
              variant="ghost"
              size="icon"
              className="relative"
              onClick={(e) => {
                e.stopPropagation();
                setNotifOpen((o) => !o);
              }}
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {pendingCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
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
                {pendingCount > 0 ? (
                  <div className="px-4 py-3 flex items-start gap-3 hover:bg-muted/50">
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                      <AlertCircle className="h-3.5 w-3.5 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {pendingCount} pending application{pendingCount > 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Requires your review</p>
                      <Link href="/dashboard/admin/admissions">
                        <span className="text-xs text-primary font-medium cursor-pointer mt-1 inline-block hover:underline">
                          Review now
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

            {/* Welcome + Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  Welcome back{(user as any)?.firstName ? `, ${(user as any).firstName}` : ""}!
                </h2>
                <p className="text-muted-foreground mt-0.5">
                  Here&apos;s what&apos;s happening at your school today.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link href="/dashboard/admin/users">
                  <Button size="sm" variant="outline">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite Teacher
                  </Button>
                </Link>
                <Link href="/dashboard/admin/courses">
                  <Button size="sm">
                    <BookOpen className="mr-2 h-4 w-4" />
                    Create Course
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Students"
                value={stats?.totalStudents}
                icon={GraduationCap}
                color="bg-success/10 text-success"
                loading={statsLoading}
              />
              <StatCard
                title="Total Teachers"
                value={stats?.totalTeachers}
                icon={Users}
                color="bg-primary/10 text-primary"
                loading={statsLoading}
              />
              <StatCard
                title="Active Courses"
                value={stats?.totalCourses}
                icon={BookOpen}
                color="bg-chart-5/10 text-chart-5"
                loading={statsLoading}
              />
              <StatCard
                title="Pending Applications"
                value={stats?.pendingApplications}
                icon={ClipboardList}
                color="bg-warning/10 text-warning"
                loading={statsLoading}
                sub={pendingCount > 0 ? "Requires review" : "All caught up"}
              />
            </div>

            {/* Quick Actions tiles */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Link href="/dashboard/admin/users">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer">
                    <UserPlus className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm font-medium text-primary">Invite Teacher</span>
                  </div>
                </Link>
                <Link href="/dashboard/admin/courses">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-chart-5/30 bg-chart-5/10 hover:bg-chart-5/20 transition-colors cursor-pointer">
                    <BookOpen className="h-5 w-5 text-chart-5 shrink-0" />
                    <span className="text-sm font-medium text-chart-5">Create Course</span>
                  </div>
                </Link>
                <Link href="/dashboard/admin/admissions">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/10 hover:bg-warning/20 transition-colors cursor-pointer">
                    <ClipboardList className="h-5 w-5 text-warning shrink-0" />
                    <span className="text-sm font-medium text-warning">Manage Applications</span>
                  </div>
                </Link>
              </div>
            </div>

            {/* Recent Students Table */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Recent Students</CardTitle>
                    <CardDescription>Latest enrolled students</CardDescription>
                  </div>
                  <Link href="/dashboard/admin/users">
                    <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                      View all <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {["Name", "Student ID", "Email", "Role", "Joined", "Status"].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {studentsLoading ? (
                        <TableSkeleton cols={6} />
                      ) : students.length > 0 ? (
                        students.map((s) => {
                          const createdAt = s.createdAt || s.created_at;
                          const studentId = s.uniqueStudentId || s.unique_student_id;
                          const first = s.firstName || s.first_name || "";
                          const last = s.lastName || s.last_name || "";
                          const avatar = s.avatarUrl || s.avatar_url || "";
                          return (
                            <tr
                              key={s.id}
                              className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-7 w-7 shrink-0">
                                    <AvatarImage src={avatar} />
                                    <AvatarFallback className="bg-success/10 text-success text-xs">
                                      {getInitials(first, last)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-foreground whitespace-nowrap">
                                    {first} {last}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                {studentId || <span className="text-muted-foreground/60">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                                {s.email || <span className="text-muted-foreground/60">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${roleBadgeClass(s.role)}`}
                                >
                                  {s.role || "student"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                                {formatDate(createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${statusBadgeClass(s.status || "active")}`}
                                >
                                  {s.status || "Active"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-10 text-center text-muted-foreground text-sm"
                          >
                            No students enrolled yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Recent Teachers Table */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Recent Teachers</CardTitle>
                    <CardDescription>Teaching staff at your school</CardDescription>
                  </div>
                  <Link href="/dashboard/admin/users">
                    <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                      View all <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {["Name", "Email", "Courses Assigned", "Joined"].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teachersLoading ? (
                        <TableSkeleton cols={4} />
                      ) : teachers.length > 0 ? (
                        teachers.map((t) => {
                          const createdAt = t.createdAt || t.created_at;
                          const first = t.firstName || t.first_name || "";
                          const last = t.lastName || t.last_name || "";
                          const avatar = t.avatarUrl || t.avatar_url || "";
                          return (
                            <tr
                              key={t.id}
                              className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-7 w-7 shrink-0">
                                    <AvatarImage src={avatar} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                      {getInitials(first, last)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-foreground whitespace-nowrap">
                                    {first} {last}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                                {t.email || <span className="text-muted-foreground/60">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-muted-foreground">
                                {t.courses_count != null ? t.courses_count : <span className="text-muted-foreground/60">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                                {formatDate(createdAt)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-10 text-center text-muted-foreground text-sm"
                          >
                            No teachers found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Release Transcripts Card */}
          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GraduationCap className="h-4 w-4" />
                  Transcripts
                </CardTitle>
                <CardDescription>Notify all students that their transcripts are available.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setReleaseDialogOpen(true)} className="gap-2">
                  <Send className="h-4 w-4" />
                  Release Transcripts
                </Button>
              </CardContent>
            </Card>
          </div>

        </main>
      </div>

      {/* Release Transcripts Dialog */}
      <Dialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Transcripts</DialogTitle>
            <DialogDescription>
              Send a notification to all students that their transcripts are available.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="semester">Semester (optional)</Label>
              <Input
                id="semester"
                placeholder="e.g. Spring 2026"
                value={releaseSemester}
                onChange={(e) => setReleaseSemester(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="release-message">Custom Message (optional)</Label>
              <Textarea
                id="release-message"
                placeholder="Your transcript is now available..."
                value={releaseMessage}
                onChange={(e) => setReleaseMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseDialogOpen(false)} disabled={releasing}>
              Cancel
            </Button>
            <Button onClick={handleReleaseTranscripts} disabled={releasing} className="gap-2">
              {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {releasing ? "Releasing..." : "Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentWidget />
      <NotesWidget />
      <StickyNotesLayer />
    </div>
  );
}
