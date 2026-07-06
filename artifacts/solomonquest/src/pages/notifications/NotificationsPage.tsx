import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  link?: string | null;
  read: boolean;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationsList() {
  const [, navigate] = useLocation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      setNotifications(data ?? []);
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PUT" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      toast.error("Failed to mark as read");
    }
  };

  const handleClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
      fetch(`/api/notifications/${notif.id}/read`, { method: "PUT" }).catch(() => {});
    }
    if (notif.link) navigate(notif.link);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notifications</h1>
          <p className="text-muted-foreground mt-0.5">Everything you've been notified about.</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead}>
          <CheckCheck className="mr-2 h-4 w-4" />
          Mark all read
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-4 w-64 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No notifications yet</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    onClick={() => handleClick(notif)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 ${
                      !notif.read ? "bg-orange-50/60" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        notif.read ? "bg-gray-300" : "bg-orange-500"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(notif.created_at)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const role = user?.role;

  if (role === "admin" || role === "super_admin") {
    return (
      <AdminLayout>
        <NotificationsList />
      </AdminLayout>
    );
  }
  if (role === "teacher") {
    return (
      <TeacherLayout>
        <NotificationsList />
      </TeacherLayout>
    );
  }
  return (
    <StudentLayout>
      <NotificationsList />
    </StudentLayout>
  );
}
