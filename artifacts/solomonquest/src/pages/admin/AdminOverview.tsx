import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useGetAdminStats,
  useListApplications,
  useListAnnouncements,
  useCreateAnnouncement,
  getListAnnouncementsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  GraduationCap,
  Users,
  BookOpen,
  ClipboardList,
  TrendingUp,
  Bell,
  Plus,
  UserPlus,
  ArrowRight,
  Megaphone,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
    <Card className="relative overflow-hidden border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-9 w-20 mt-1" />
            ) : (
              <p className="text-3xl font-bold tracking-tight mt-1">{value ?? 0}</p>
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

function statusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "approved": return "bg-green-100 text-green-700 border-green-200";
    case "rejected": return "bg-red-100 text-red-700 border-red-200";
    case "under_review":
    case "under review": return "bg-blue-100 text-blue-700 border-blue-200";
    case "finalizing": return "bg-purple-100 text-purple-700 border-purple-200";
    default: return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status?.toLowerCase()) {
    case "approved": return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "rejected": return <XCircle className="h-3.5 w-3.5" />;
    default: return <AlertCircle className="h-3.5 w-3.5" />;
  }
}

export default function AdminOverview() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: applications, isLoading: appsLoading } = useListApplications();
  const { data: announcements, isLoading: announcementsLoading } = useListAnnouncements();
  const createAnnouncement = useCreateAnnouncement();

  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");

  const recentApps = applications?.slice(0, 5) ?? [];
  const recentAnnouncements = announcements?.slice(0, 4) ?? [];

  const handleCreateAnnouncement = () => {
    if (!announcementTitle.trim()) return;
    createAnnouncement.mutate(
      { data: { title: announcementTitle, body: announcementBody } },
      {
        onSuccess: () => {
          toast.success("Announcement posted");
          setAnnouncementOpen(false);
          setAnnouncementTitle("");
          setAnnouncementBody("");
          queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to post announcement"),
      }
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard Overview</h1>
            <p className="text-muted-foreground mt-0.5">
              Welcome back. Here's what's happening at your school.
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={announcementOpen} onOpenChange={setAnnouncementOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Megaphone className="mr-2 h-4 w-4" />
                  Announce
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Announcement</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input
                      placeholder="Announcement title..."
                      value={announcementTitle}
                      onChange={(e) => setAnnouncementTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Message</Label>
                    <Textarea
                      placeholder="Write your announcement..."
                      rows={4}
                      value={announcementBody}
                      onChange={(e) => setAnnouncementBody(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreateAnnouncement}
                    disabled={createAnnouncement.isPending || !announcementTitle.trim()}
                  >
                    {createAnnouncement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Post Announcement
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Link href="/dashboard/admin/users">
              <Button size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Teacher
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Teachers"
            value={stats?.totalTeachers}
            icon={Users}
            color="bg-blue-500"
            loading={statsLoading}
          />
          <StatCard
            title="Total Students"
            value={stats?.totalStudents}
            icon={GraduationCap}
            color="bg-emerald-500"
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
            sub={stats?.pendingApplications ? "Requires review" : "All caught up"}
          />
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Invite Teacher", href: "/dashboard/admin/users", icon: UserPlus, color: "text-blue-600 bg-blue-50 hover:bg-blue-100" },
              { label: "Create Course", href: "/dashboard/admin/courses", icon: BookOpen, color: "text-violet-600 bg-violet-50 hover:bg-violet-100" },
              { label: "View Applications", href: "/dashboard/admin/admissions", icon: ClipboardList, color: "text-orange-600 bg-orange-50 hover:bg-orange-100" },
              { label: "Post Announcement", href: "#", icon: Bell, color: "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" },
            ].map((action) => {
              const Icon = action.icon;
              if (action.href === "#") {
                return (
                  <button
                    key={action.label}
                    onClick={() => setAnnouncementOpen(true)}
                    className={`flex items-center gap-3 p-4 rounded-xl transition-colors border border-transparent text-left ${action.color}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">{action.label}</span>
                  </button>
                );
              }
              return (
                <Link key={action.label} href={action.href}>
                  <div className={`flex items-center gap-3 p-4 rounded-xl transition-colors border border-transparent cursor-pointer ${action.color}`}>
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">{action.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Two column: Applications + Announcements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Applications */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Recent Applications</CardTitle>
                <Link href="/dashboard/admin/admissions">
                  <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <CardDescription>Latest admissions activity</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {appsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : recentApps.length > 0 ? (
                <div className="space-y-3">
                  {recentApps.map((app) => (
                    <div key={app.id} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs shrink-0">
                        {(app.applicantName || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {app.applicantName || "Unknown Applicant"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {app.programName || "General Admission"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(app.status)}`}
                      >
                        <StatusIcon status={app.status} />
                        <span className="capitalize">{app.status?.replace("_", " ")}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No applications yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Announcements */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Announcements</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setAnnouncementOpen(true)}
                >
                  <Plus className="h-3 w-3" /> New
                </Button>
              </div>
              <CardDescription>School-wide messages</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {announcementsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <Skeleton className="h-4 w-40 mb-1" />
                      <Skeleton className="h-3 w-full mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  ))}
                </div>
              ) : recentAnnouncements.length > 0 ? (
                <div className="space-y-4">
                  {recentAnnouncements.map((ann) => (
                    <div key={ann.id} className="border-l-2 border-primary/30 pl-3">
                      <p className="text-sm font-semibold text-gray-900">{ann.title}</p>
                      {ann.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ann.body}</p>
                      )}
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {ann.createdAt
                          ? formatDistanceToNow(new Date(ann.createdAt), { addSuffix: true })
                          : "Recently"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No announcements yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        {stats?.recentActivity && stats.recentActivity.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              <CardDescription>Latest actions across your school</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {stats.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="mt-0.5 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activity.createdAt
                          ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
