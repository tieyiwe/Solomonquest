import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Users,
  BookOpen,
  FileText,
  Bell,
  Settings,
  Home,
  MessageSquare,
  Globe,
  GraduationCap,
  ClipboardList,
  UserPlus,
  ChevronRight,
  LogOut,
  Menu,
  X,
  TrendingUp,
  AlertCircle,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetAdminStats,
  useListUsers,
  useListApplications,
} from "@workspace/api-client-react";

// ─── Sidebar Navigation ─────────────────────────────────────────────────────

const navLinks = [
  { href: "/dashboard/admin", label: "Overview", icon: Home, exact: true },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: ClipboardList },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/forum", label: "Forum", icon: Globe },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
];

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <Link href="/dashboard/admin">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              S
            </div>
            <div className="overflow-hidden">
              <p className="text-white font-semibold text-sm truncate leading-tight">SolomonQuest</p>
              <p className="text-slate-400 text-xs">Admin Panel</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = link.exact
            ? location === link.href
            : location.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href}>
              <button
                onClick={onClose}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{link.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-70" />}
              </button>
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
          <Avatar className="h-8 w-8 border border-white/20">
            <AvatarImage src={user?.avatarUrl || ""} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-white text-sm font-medium truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-slate-400 text-xs capitalize truncate">
              {user?.role?.replace("_", " ")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-400/10"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

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
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-9 w-20 mt-1" />
            ) : (
              <p className="text-3xl font-bold tracking-tight mt-1 text-gray-900">{value ?? 0}</p>
            )}
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roleBadgeClass(role?: string | null) {
  switch (role) {
    case "admin":
    case "super_admin":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "teacher":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "student":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function statusBadgeClass(status?: string | null) {
  switch (status?.toLowerCase()) {
    case "approved":
      return "bg-green-100 text-green-700 border-green-200";
    case "rejected":
      return "bg-red-100 text-red-700 border-red-200";
    case "active":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }
}

function TableSkeleton({ cols, rows = 4 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminOverview() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: students, isLoading: studentsLoading } = useListUsers({ role: "student" });
  const { data: teachers, isLoading: teachersLoading } = useListUsers({ role: "teacher" });
  const { data: applications } = useListApplications();

  const recentStudents = (students ?? []).slice(0, 6);
  const recentTeachers = (teachers ?? []).slice(0, 6);
  const pendingCount = applications?.filter((a) => a.status === "pending").length ?? 0;

  // Close notif dropdown when clicking outside
  useEffect(() => {
    if (!notifOpen) return;
    const handler = () => setNotifOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [notifOpen]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
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
        <header className="h-14 bg-white border-b flex items-center px-4 gap-3 sticky top-0 z-20 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900 hidden md:block">
              Dashboard Overview
            </h1>
            <h1 className="text-base font-semibold text-gray-900 md:hidden">SolomonQuest</h1>
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
              <Bell className="h-5 w-5 text-gray-600" />
              {pendingCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </Button>
            {notifOpen && (
              <div
                className="absolute right-0 top-10 w-72 bg-white rounded-xl shadow-lg border z-50 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Notifications</p>
                  <button
                    className="text-gray-400 hover:text-gray-600"
                    onClick={() => setNotifOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {pendingCount > 0 ? (
                  <div className="divide-y">
                    <div className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50">
                      <div className="mt-0.5 h-7 w-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {pendingCount} pending application{pendingCount > 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Requires your review
                        </p>
                        <Link href="/dashboard/admin/admissions">
                          <span className="text-xs text-primary font-medium cursor-pointer mt-1 inline-block hover:underline">
                            Review now
                          </span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">You are all caught up!</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Avatar */}
          <Avatar className="h-8 w-8 border">
            <AvatarImage src={user?.avatarUrl || ""} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-8">
            {/* Welcome */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                  Welcome back{user?.firstName ? `, ${user.firstName}` : ""}!
                </h2>
                <p className="text-muted-foreground mt-0.5">
                  Here's what's happening at your school today.
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

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Students"
                value={stats?.totalStudents}
                icon={GraduationCap}
                color="bg-emerald-500"
                loading={statsLoading}
                sub={
                  students
                    ? `${
                        students.filter((s) => {
                          const raw = (s as any).createdAt || (s as any).created_at;
                          if (!raw) return false;
                          return new Date(raw) > subDays(new Date(), 7);
                        }).length
                      } new this week`
                    : undefined
                }
              />
              <StatCard
                title="Total Teachers"
                value={stats?.totalTeachers}
                icon={Users}
                color="bg-blue-500"
                loading={statsLoading}
              />
              <StatCard
                title="Active Courses"
                value={stats?.totalCourses}
                icon={BookOpen}
                color="bg-violet-500"
                loading={statsLoading}
              />
              <StatCard
                title="Pending Applications"
                value={stats?.pendingApplications}
                icon={ClipboardList}
                color="bg-orange-500"
                loading={statsLoading}
                sub={
                  stats?.pendingApplications
                    ? "Requires review"
                    : "All caught up"
                }
              />
            </div>

            {/* Quick Actions */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Link href="/dashboard/admin/users">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer">
                    <UserPlus className="h-5 w-5 text-blue-600 shrink-0" />
                    <span className="text-sm font-medium text-blue-700">Invite Teacher</span>
                  </div>
                </Link>
                <Link href="/dashboard/admin/courses">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-violet-100 bg-violet-50 hover:bg-violet-100 transition-colors cursor-pointer">
                    <BookOpen className="h-5 w-5 text-violet-600 shrink-0" />
                    <span className="text-sm font-medium text-violet-700">Create Course</span>
                  </div>
                </Link>
                <Link href="/dashboard/admin/admissions">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-orange-100 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer">
                    <ClipboardList className="h-5 w-5 text-orange-600 shrink-0" />
                    <span className="text-sm font-medium text-orange-700">Manage Applications</span>
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
                      <tr className="border-b bg-gray-50/60">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Name
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">
                          Student ID
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">
                          Email
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Role
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">
                          Joined
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">
                          School
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentsLoading ? (
                        <TableSkeleton cols={6} />
                      ) : recentStudents.length > 0 ? (
                        recentStudents.map((s) => {
                          const raw = s as any;
                          const createdAt = raw.createdAt || raw.created_at;
                          return (
                            <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-7 w-7 shrink-0">
                                    <AvatarImage src={s.avatarUrl || ""} />
                                    <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
                                      {getInitials(s.firstName, s.lastName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-gray-900 whitespace-nowrap">
                                    {s.firstName} {s.lastName}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                                {raw.uniqueStudentId || raw.unique_student_id || (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                                {s.email || <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${roleBadgeClass(s.role)}`}
                                >
                                  {s.role || "student"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                                {createdAt ? (
                                  <span title={format(new Date(createdAt), "PPP")}>
                                    {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                {raw.schoolName || raw.school_name || (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
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
                      <tr className="border-b bg-gray-50/60">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Name
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">
                          Email
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">
                          Subject
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">
                          Joined
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachersLoading ? (
                        <TableSkeleton cols={5} />
                      ) : recentTeachers.length > 0 ? (
                        recentTeachers.map((t) => {
                          const raw = t as any;
                          const createdAt = raw.createdAt || raw.created_at;
                          return (
                            <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-7 w-7 shrink-0">
                                    <AvatarImage src={t.avatarUrl || ""} />
                                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                                      {getInitials(t.firstName, t.lastName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-gray-900 whitespace-nowrap">
                                    {t.firstName} {t.lastName}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                                {t.email || <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                                {raw.subject || raw.subjectArea || (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                                {createdAt ? (
                                  <span title={format(new Date(createdAt), "PPP")}>
                                    {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${statusBadgeClass(raw.status || "active")}`}
                                >
                                  {raw.status || "Active"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">
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
        </main>
      </div>
    </div>
  );
}
